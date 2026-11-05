import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { readJsonBody } from "@/lib/server/request-body";
import { readCertificateData, createCertificate } from "@/lib/server/certificate-store";
import { WORKBOOK_HEADERS } from "@/lib/workbook-types";
import { validateRecordInput, valuesFromInput } from "@/lib/server/record-validation";
import { expiryFromIssueDate } from "@/lib/record-dates";

export const runtime = "nodejs";

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function currentPeriod(): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? String(new Date().getFullYear());
  const monthNumber = Number(parts.find((part) => part.type === "month")?.value ?? new Date().getMonth() + 1);
  return { year, month: MONTH_NAMES[monthNumber - 1] ?? MONTH_NAMES[0] };
}

export async function GET() {
  try {
    await requireAccess();
    return Response.json(await readCertificateData(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiErrorResponse(e, "api/records");
  }
}

export async function POST(request: Request) {
  try {
    await requireAccess("editor");
    const body = await readJsonBody(request);
    const parsed = validateRecordInput(body?.values, true);
    const values = valuesFromInput(parsed);
    const issueIndex = WORKBOOK_HEADERS.indexOf("Data de emissão/renovação");
    const expiryIndex = WORKBOOK_HEADERS.indexOf("Data de vencimento");
    values[expiryIndex] = expiryFromIssueDate(values[issueIndex]);
    const yearIndex = WORKBOOK_HEADERS.indexOf("Ano da planilha");
    const monthIndex = WORKBOOK_HEADERS.indexOf("Mês da planilha");
    const selectedYear = values[yearIndex];
    const selectedMonth = values[monthIndex];
    const currentYear = Number(currentPeriod().year);
    const validYears = Array.from({ length: Math.max(0, currentYear - 2024 + 1) }, (_, index) => String(currentYear - index));
    if (typeof selectedYear !== "string" || !validYears.includes(selectedYear)) {
      throw new Error("INVALID_INPUT");
    }
    if (typeof selectedMonth !== "string" || !MONTH_NAMES.includes(selectedMonth)) {
      throw new Error("INVALID_INPUT");
    }
    const rowNumber = await createCertificate(values);
    return Response.json({ ok: true, rowNumber, headers: WORKBOOK_HEADERS }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiErrorResponse(e, "api/records");
  }
}
