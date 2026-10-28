import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { readCertificateData, createCertificate } from "@/lib/server/certificate-store";
import { WORKBOOK_HEADERS } from "@/lib/workbook-types";
import { validateRecordInput, valuesFromInput } from "@/lib/server/record-validation";

export const runtime = "nodejs";
export async function GET() { try { await requireAccess(); return Response.json(await readCertificateData(), { headers: { "Cache-Control": "no-store" } }); } catch (e) { return apiErrorResponse(e, "api/records"); } }
export async function POST(request: Request) { try { await requireAccess("editor"); const body = await request.json(); const parsed = validateRecordInput(body?.values); await createCertificate(valuesFromInput(parsed)); return Response.json({ ok: true, headers: WORKBOOK_HEADERS }, { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (e) { return apiErrorResponse(e, "api/records"); } }
