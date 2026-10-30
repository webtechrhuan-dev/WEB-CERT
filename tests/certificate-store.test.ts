import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbookCell, WorkbookRecord } from "../lib/workbook-types";

const { getMongoDb } = vi.hoisted(() => ({ getMongoDb: vi.fn() }));
vi.mock("../lib/server/mongodb", () => ({ getMongoDb }));

import {
  createCertificate,
  importCertificates,
  readCertificateData,
  updateCertificate,
} from "../lib/server/certificate-store";

type StoredRecord = {
  rowNumber: number;
  values: WorkbookCell[];
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

function makeDatabase(initial: StoredRecord[]) {
  const documents = initial.map((document) => ({ ...document, values: [...document.values] }));
  let counterValue: number | undefined;

  const certificates = {
    createIndex: vi.fn(async () => "rowNumber_unique"),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        toArray: async () => documents.map((document) => ({ ...document, values: [...document.values] })),
      })),
    })),
    findOne: vi.fn(async (filter: { rowNumber?: number }) => {
      const document = filter.rowNumber === undefined
        ? [...documents].sort((a, b) => b.rowNumber - a.rowNumber)[0]
        : documents.find((item) => item.rowNumber === filter.rowNumber);
      return document ? { _id: "record", ...document } : null;
    }),
    findOneAndUpdate: vi.fn(async (
      filter: { rowNumber: number; version?: number; $or?: Array<{ version?: number | { $exists: boolean } }> },
      update: { $set: { values: WorkbookCell[]; updatedAt: Date; version: number } },
    ) => {
      const document = documents.find((item) => item.rowNumber === filter.rowNumber);
      if (!document) return null;
      const matchesVersion = filter.version !== undefined
        ? document.version === filter.version
        : Boolean(filter.$or?.some((condition) =>
            condition.version === 0
              ? document.version === 0
              : Boolean(typeof condition.version === "object" && condition.version.$exists === false && document.version === undefined),
          ));
      if (!matchesVersion) return null;
      document.values = [...update.$set.values];
      document.updatedAt = update.$set.updatedAt;
      document.version = update.$set.version;
      return { _id: "record", ...document, values: [...document.values] };
    }),
    insertOne: vi.fn(async (document: StoredRecord) => {
      documents.push({ ...document, values: [...document.values] });
      return { acknowledged: true, insertedId: "record" };
    }),
    bulkWrite: vi.fn(async (operations: Array<{ updateOne: { filter: { rowNumber: number }; update: { $set: { values: WorkbookCell[]; updatedAt: Date }; $setOnInsert: { rowNumber: number; createdAt: Date }; $inc: { version: number } } } }>) => {
      for (const operation of operations) {
        const { filter, update } = operation.updateOne;
        const existing = documents.find((document) => document.rowNumber === filter.rowNumber);
        if (existing) {
          existing.values = [...update.$set.values];
          existing.updatedAt = update.$set.updatedAt;
          existing.version = (existing.version ?? 0) + update.$inc.version;
        } else {
          documents.push({
            rowNumber: update.$setOnInsert.rowNumber,
            values: [...update.$set.values],
            createdAt: update.$setOnInsert.createdAt,
            updatedAt: update.$set.updatedAt,
            version: update.$inc.version,
          });
        }
      }
      return { acknowledged: true, upsertedCount: operations.length };
    }),
  };

  const counters = {
    updateOne: vi.fn(async (
      _filter: { _id: string },
      update: { $max?: { value: number }; $setOnInsert?: { value: number } },
    ) => {
      if (update.$max) counterValue = Math.max(counterValue ?? Number.MIN_SAFE_INTEGER, update.$max.value);
      if (counterValue === undefined && update.$setOnInsert) counterValue = update.$setOnInsert.value;
      return { acknowledged: true };
    }),
    findOneAndUpdate: vi.fn(async (
      _filter: { _id: string },
      update: { $inc: { value: number } },
    ) => {
      counterValue = (counterValue ?? 0) + update.$inc.value;
      return { _id: "certificate-row-number", value: counterValue };
    }),
  };

  const db = {
    collection: vi.fn((name: string) => name === "certificates" ? certificates : counters),
  };
  return { db, certificates, counters, documents };
}

const values = (client: string): WorkbookCell[] => [
  "2026", "Outubro", client, "contato", "2026-10-01", null, "CNPJ - A1", "100", "30", "Ativo",
];

describe("integridade e concorrência no MongoDB", () => {
  beforeEach(() => getMongoDb.mockReset());

  it("carrega a versão persistida junto com cada registro", async () => {
    const { db, certificates } = makeDatabase([
      { rowNumber: 2, values: ["2026", "Janeiro", "Cliente"], version: 7 },
    ]);
    getMongoDb.mockResolvedValue(db);

    const data = await readCertificateData();

    expect(data.records[0]).toMatchObject({ rowNumber: 2, version: "7" });
    expect(certificates.find).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ projection: expect.objectContaining({ version: 1 }) }),
    );
  });

  it("aceita somente uma das duas edições concorrentes da mesma revisão", async () => {
    const originalValues: WorkbookCell[] = ["2026", "Janeiro", "Cliente original"];
    const { db, documents } = makeDatabase([
      { rowNumber: 2, values: originalValues, version: 5 },
    ]);
    getMongoDb.mockResolvedValue(db);

    const results = await Promise.allSettled([
      updateCertificate(2, ["2026", "Janeiro", "Alteração A"], "5"),
      updateCertificate(2, ["2026", "Janeiro", "Alteração B"], "5"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({ reason: { message: "RECORD_CONFLICT" } });
    expect(documents[0].version).toBe(6);
    expect(["Alteração A", "Alteração B"]).toContain(documents[0].values[2]);
  });

  it("permite a primeira edição de um registro legado sem campo version", async () => {
    const { db, documents } = makeDatabase([
      { rowNumber: 9, values: ["2025", "Dezembro", "Legado"] },
    ]);
    getMongoDb.mockResolvedValue(db);

    await expect(
      updateCertificate(9, ["2025", "Dezembro", "Atualizado"], "0"),
    ).resolves.toBe(true);

    expect(documents[0].version).toBe(1);
    expect(documents[0].values[2]).toBe("Atualizado");
  });

  it("diferencia registro inexistente de conflito de versão", async () => {
    const { db } = makeDatabase([]);
    getMongoDb.mockResolvedValue(db);

    await expect(updateCertificate(404, [], "1"))
      .rejects.toMatchObject({ message: "RECORD_NOT_FOUND" });
  });

  it("aloca rowNumber sequencial em cadastros consecutivos", async () => {
    const { db, documents, counters } = makeDatabase([]);
    getMongoDb.mockResolvedValue(db);

    await createCertificate(values("Cliente A"));
    await createCertificate(values("Cliente B"));

    expect(documents.map((document) => document.rowNumber)).toEqual([2, 3]);
    expect(documents.map((document) => document.version)).toEqual([1, 1]);
    expect(counters.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it("rejeita números de linha duplicados ou inválidos antes de gravar o lote", async () => {
    const { db, certificates } = makeDatabase([]);
    getMongoDb.mockResolvedValue(db);
    const duplicate: WorkbookRecord[] = [
      { rowNumber: 2, values: values("A") },
      { rowNumber: 2, values: values("B") },
    ];

    await expect(importCertificates(duplicate))
      .rejects.toMatchObject({ message: "INVALID_IMPORT_RECORD" });
    expect(certificates.bulkWrite).not.toHaveBeenCalled();
  });

  it("reconcilia o contador com registros antigos fora do lote importado", async () => {
    const { db, documents, counters } = makeDatabase([
      { rowNumber: 200, values: values("Registro legado"), version: 4 },
    ]);
    getMongoDb.mockResolvedValue(db);

    const imported: WorkbookRecord[] = [
      { rowNumber: 2, values: values("Importado A") },
      { rowNumber: 3, values: values("Importado B") },
    ];
    await importCertificates(imported);
    await createCertificate(values("Novo cadastro"));

    expect(documents.map((document) => document.rowNumber).sort((a, b) => a - b))
      .toEqual([2, 3, 200, 201]);
    expect(counters.updateOne).toHaveBeenCalledWith(
      { _id: "certificate-row-number" },
      { $max: { value: 200 } },
      { upsert: true },
    );
  });
});
