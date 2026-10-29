import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { readCertificateData, updateCertificate } from "@/lib/server/certificate-store";
import { validateRecordInput, valuesFromInput } from "@/lib/server/record-validation";

function expiryFromIssueDate(value: unknown): string | null {
 if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
 const [year, month, day] = value.split("-").map(Number);
 const expiryYear = year + 1;
 const lastDay = new Date(Date.UTC(expiryYear, month, 0)).getUTCDate();
 return [expiryYear, String(month).padStart(2, "0"), String(Math.min(day, lastDay)).padStart(2, "0")].join("-");
}
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function currentYear(): number {
  const year = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date());
  return Number(year);
}

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ rowNumber: string }> }) { try { await requireAccess("editor"); const rowNumber = Number((await context.params).rowNumber); if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("RECORD_NOT_FOUND"); const data = await readCertificateData(); const current = data.records.find((r) => r.rowNumber === rowNumber); if (!current) throw new Error("RECORD_NOT_FOUND"); const contentLength = Number(request.headers.get("content-length") ?? 0); if (contentLength > 512_000) return Response.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Requisição muito grande." } }, { status: 413, headers: { "Cache-Control": "no-store" } }); const body = await request.json(); const parsed = validateRecordInput(body?.values);
 const validYears = Array.from({ length: Math.max(0, currentYear() - 2024 + 1) }, (_, index) => String(currentYear() - index));
 if (parsed["Ano da planilha"] !== undefined && (typeof parsed["Ano da planilha"] !== "string" || !validYears.includes(parsed["Ano da planilha"]))) throw new Error("INVALID_INPUT");
 if (parsed["Mês da planilha"] !== undefined && (typeof parsed["Mês da planilha"] !== "string" || !MONTH_NAMES.includes(parsed["Mês da planilha"]))) throw new Error("INVALID_INPUT");
 const values = [...current.values]; for (const [header, value] of Object.entries(parsed)) { if (header !== "Data de vencimento") values[data.headers.indexOf(header)] = value === null ? null : value; } const issueIndex = data.headers.indexOf("Data de emissão/renovação"); const expiryIndex = data.headers.indexOf("Data de vencimento"); values[expiryIndex] = expiryFromIssueDate(values[issueIndex]); await updateCertificate(rowNumber, values, body?.expectedVersion); return Response.json({ ok: true, version: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return apiErrorResponse(e, "api/records/[rowNumber]"); } }
