import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { readCertificateData, updateCertificate } from "@/lib/server/certificate-store";
import { validateRecordInput, valuesFromInput } from "@/lib/server/record-validation";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ rowNumber: string }> }) { try { await requireAccess("editor"); const rowNumber = Number((await context.params).rowNumber); if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("RECORD_NOT_FOUND"); const data = await readCertificateData(); const current = data.records.find((r) => r.rowNumber === rowNumber); if (!current) throw new Error("RECORD_NOT_FOUND"); const body = await request.json(); const parsed = validateRecordInput(body?.values); const values = [...current.values]; for (const [header, value] of Object.entries(parsed)) values[data.headers.indexOf(header)] = value === null ? null : value; await updateCertificate(rowNumber, values, body?.expectedVersion); return Response.json({ ok: true, version: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return apiErrorResponse(e, "api/records/[rowNumber]"); } }
