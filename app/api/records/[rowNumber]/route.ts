import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/server/access";
import { verifyReauthentication } from "@/auth";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { readJsonBody } from "@/lib/server/request-body";
import { readCertificateData, updateCertificate } from "@/lib/server/certificate-store";
import { validateRecordInput, valuesFromInput } from "@/lib/server/record-validation";
import { writeAuditEvent } from "@/lib/server/audit-log";
import { getCertificatesDb, ensureCertificateStoreIndexes } from "@/lib/server/certificates-mongodb";
import { acquireCertificateMutationLock, releaseCertificateMutationLock } from "@/lib/server/certificate-store";
import { expiryFromIssueDate } from "@/lib/record-dates";

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function currentYear(): number {
  const year = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date());
  return Number(year);
}

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ rowNumber: string }> }) { try { const access = await requireAccess("editor"); const rowNumber = Number((await context.params).rowNumber); if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("RECORD_NOT_FOUND"); const data = await readCertificateData(); const current = data.records.find((r) => r.rowNumber === rowNumber); if (!current) throw new Error("RECORD_NOT_FOUND"); const body = await readJsonBody(request); const parsed = validateRecordInput(body?.values);
 const validYears = Array.from({ length: Math.max(0, currentYear() - 2024 + 1) }, (_, index) => String(currentYear() - index));
 if (parsed["Ano da planilha"] !== undefined && (typeof parsed["Ano da planilha"] !== "string" || !validYears.includes(parsed["Ano da planilha"]))) throw new Error("INVALID_INPUT");
 if (parsed["Mês da planilha"] !== undefined && (typeof parsed["Mês da planilha"] !== "string" || !MONTH_NAMES.includes(parsed["Mês da planilha"]))) throw new Error("INVALID_INPUT");
 const values = [...current.values]; for (const [header, value] of Object.entries(parsed)) { if (header !== "Data de vencimento") values[data.headers.indexOf(header)] = value === null ? null : value; } const issueIndex = data.headers.indexOf("Data de emissão/renovação"); const expiryIndex = data.headers.indexOf("Data de vencimento"); values[expiryIndex] = expiryFromIssueDate(values[issueIndex]); if (typeof body?.expectedVersion !== "string") throw new Error("RECORD_CONFLICT"); await updateCertificate(rowNumber, values, body.expectedVersion); const auditRecorded = await writeAuditEvent({ actor: access.login, action: "sale.updated", entity: "sale", entityId: String(rowNumber), metadata: { changedFields: Object.keys(parsed) } }); return Response.json({ ok: true, auditRecorded }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return apiErrorResponse(e, "api/records/[rowNumber]"); } }


export async function DELETE(request: Request, context: { params: Promise<{ rowNumber: string }> }) {
  try {
    const access = await requireAccess("editor");
    const rowNumber = Number((await context.params).rowNumber);
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) throw new Error("RECORD_NOT_FOUND");
    const body = await readJsonBody(request);
    if (typeof body?.expectedVersion !== "string") throw new Error("RECORD_CONFLICT");
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!username || username !== access.login.toLowerCase() || !password || !(await verifyReauthentication(username, password))) {
      return Response.json({ error: { code: "REAUTHENTICATION_FAILED", message: "Usuário ou senha incorretos. A venda não foi excluída." } }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    // O mesmo lock é usado pelo upload: assim não existe janela entre a
    // contagem dos anexos e a exclusão da venda em que um novo arquivo entre.
    const mutationToken = randomUUID();
    if (!(await acquireCertificateMutationLock(rowNumber, mutationToken))) {
      return Response.json({ error: { code: "CERTIFICATE_OPERATION_IN_PROGRESS", message: "Há outra operação de certificado em andamento para esta venda. Tente novamente." } }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    try {
      await ensureCertificateStoreIndexes();
      const certificateDb = await getCertificatesDb();
      const attachedCount = await certificateDb.collection("certificate_files.files").countDocuments({ "metadata.rowNumber": rowNumber });
      if (attachedCount > 0) {
        return Response.json({ error: { code: "CERTIFICATES_ATTACHED", message: `Esta venda possui ${attachedCount} certificado(s) anexado(s). Remova ou transfira os arquivos antes de excluir a venda.` } }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      const { deleteCertificate } = await import("@/lib/server/certificate-store");
      await deleteCertificate(rowNumber, body.expectedVersion, mutationToken);
      const auditRecorded = await writeAuditEvent({ actor: access.login, action: "sale.deleted", entity: "sale", entityId: String(rowNumber) });
      return Response.json({ ok: true, deleted: true, auditRecorded }, { headers: { "Cache-Control": "no-store" } });
    } finally {
      await releaseCertificateMutationLock(rowNumber, mutationToken).catch(() => {
        console.error("[certificates] Falha ao liberar lock de mutação.");
      });
    }
  } catch (error) {
    return apiErrorResponse(error, "api/records/[rowNumber]");
  }
}
