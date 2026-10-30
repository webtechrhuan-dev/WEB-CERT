import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbookCell } from "../lib/workbook-types";

const { getMongoDb } = vi.hoisted(() => ({ getMongoDb: vi.fn() }));
vi.mock("../lib/server/mongodb", () => ({ getMongoDb }));

import { readCertificateData, updateCertificate } from "../lib/server/certificate-store";

type StoredRecord = {
  rowNumber: number;
  values: WorkbookCell[];
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

function makeDatabase(initial: StoredRecord[]) {
  const documents = initial.map((document) => ({ ...document, values: [...document.values] }));
  const certificates = {
    createIndex: vi.fn(async () => "rowNumber_unique"),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        toArray: async () => documents.map((document) => ({ ...document, values: [...document.values] })),
      })),
    })),
    findOne: vi.fn(async (filter: { rowNumber?: number }) => {
      const document = documents.find((item) => item.rowNumber === filter.rowNumber);
      return document ? { _id: "record", ...document } : null;
    }),
    findOneAndUpdate: vi.fn(async (
      filter: { rowNumber: number; version?: number; $or?: Array<Record<string, unknown>> },
      update: { $set: { values: WorkbookCell[]; updatedAt: Date; version: number } },
    ) => {
      const document = documents.find((item) => item.rowNumber === filter.rowNumber);
      if (!document) return null;
      const matchesVersion = filter.version !== undefined
        ? document.version === filter.version
        : Boolean(filter.$or?.some((condition) =>
            condition.version === 0
              ? document.version === 0
              : Boolean(condition.version && "$exists" in condition.version &&
                  document.version === undefined),
          ));
      if (!matchesVersion) return null;
      document.values = [...update.$set.values];
      document.updatedAt = update.$set.updatedAt;
      document.version = update.$set.version;
      return { _id: "record", ...document, values: [...document.values] };
    }),
  };
  const counters = {};
  const db = {
    collection: vi.fn((name: string) => name === "certificates" ? certificates : counters),
  };
  return { db, certificates, documents };
}

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
});
