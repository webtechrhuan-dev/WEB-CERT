import "server-only";
import { getMongoDb } from "@/lib/server/mongodb";

export type AuditAction =
  | "sale.created"
  | "sale.updated"
  | "sale.deleted"
  | "certificate.uploaded"
  | "certificate.downloaded"
  | "user.updated";

type AuditEvent = {
  actor: string;
  action: AuditAction;
  entity: "sale" | "certificate" | "user";
  entityId: string;
  occurredAt: Date;
  outcome: "success";
  metadata?: Record<string, string | number | boolean | string[]>;
};

/** Registra somente metadados operacionais; nunca recebe valores de venda, senhas ou bytes. */
export async function writeAuditEvent(event: Omit<AuditEvent, "occurredAt" | "outcome">): Promise<boolean> {
  try {
    const db = await getMongoDb();
    await db.collection<AuditEvent>("audit_events").insertOne({
      ...event,
      occurredAt: new Date(),
      outcome: "success",
    });
    return true;
  } catch {
    // Não transforma uma gravação comercial concluída em uma resposta falsa de falha.
    console.error("[audit] Não foi possível persistir um evento de auditoria.");
    return false;
  }
}
