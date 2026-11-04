import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMongoDb, insertOne } = vi.hoisted(() => ({
  getMongoDb: vi.fn(),
  insertOne: vi.fn(),
}));
vi.mock("../lib/server/mongodb", () => ({ getMongoDb }));

import { writeAuditEvent } from "../lib/server/audit-log";

describe("trilha de auditoria", () => {
  beforeEach(() => {
    getMongoDb.mockReset();
    insertOne.mockReset();
    getMongoDb.mockResolvedValue({
      collection: vi.fn(() => ({ insertOne })),
    });
    insertOne.mockResolvedValue({ acknowledged: true });
  });

  it("persiste ator, ação e metadados operacionais sem receber conteúdo sensível", async () => {
    const recorded = await writeAuditEvent({
      actor: "arthur",
      action: "sale.updated",
      entity: "sale",
      entityId: "27",
      metadata: { changedFields: ["Status / Observação", "Faturamento (R$)"] },
    });

    expect(recorded).toBe(true);
    const [event] = insertOne.mock.calls[0];
    expect(event).toMatchObject({
      actor: "arthur",
      action: "sale.updated",
      entity: "sale",
      entityId: "27",
      outcome: "success",
    });
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(JSON.stringify(event)).not.toMatch(/password|secret|token|certificateBytes/i);
  });

  it("não mascara uma operação principal quando a auditoria está indisponível", async () => {
    insertOne.mockRejectedValue(new Error("database unavailable"));

    await expect(writeAuditEvent({
      actor: "rhuan",
      action: "sale.deleted",
      entity: "sale",
      entityId: "12",
    })).resolves.toBe(false);
  });
});
