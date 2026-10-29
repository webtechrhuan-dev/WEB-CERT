import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { readCertificateData, updateCertificate } from "@/lib/server/certificate-store";
import { validateRecordInput, valuesFromInput } from "@/lib/server/record-validation";

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function currentYear(): number {
  const year = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date());
  return Number(year);
}

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ rowNumber: string }> }) { try { await requireAccess("editor"); const rowNumber = Number((await context.params).rowNumber); if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("RECORD_NOT_FOUND"); const data = await readCertificateData(); const current = data.records.find((r) => r.rowNumber === rowNumber); if (!current) throw new Error("RECORD_NOT_FOUND"); const body = await request.json(); const parsed = validateRecordInput(body?.values);
 const validYears = Array.from({ length: Math.max(0, currentYear() - 2024 + 1) }, (_, index) => String(currentYear() - index));
 if (parsed["Ano da planilha"] !== undefined && (typeof parsed["Ano da planilha"] !== "string" || !validYears.includes(parsed["Ano da planilha"]))) throw new Error("INVALID_INPUT");
 if (parsed["Mês da planilha"] !== undefined && (typeof parsed["Mês da planilha"] !== "string" || !MONTH_NAMES.includes(parsed["Mês da planilha"]))) throw new Error("INVALID_INPUT");
 const values = [...current.values]; for (const [header, value] of Object.entries(parsed)) values[data.headers.indexOf(header)] = value === null ? null : value; await updateCertificate(rowNumber, values, body?.expectedVersion); return Response.json({ ok: true, version: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return apiErrorResponse(e, "api/records/[rowNumber]"); } }
