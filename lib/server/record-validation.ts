import { WORKBOOK_HEADERS, type WorkbookCell } from "@/lib/workbook-types";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MODELS = ["CNPJ - A1", "CPF - A1"];
const STATUSES = ["Cancelado", "não concluido", "Orçamento/oferta enviada ao cliente", "Emitido", "Pendente instalar", "Instalado", "Concluido"];
const REQUIRED_FIELDS = ["Ano da planilha", "Mês da planilha", "Cliente", "Data de emissão/renovação", "Modelo", "Status / Observação"];

function invalid(): never { throw new Error("INVALID_INPUT"); }
function validIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function validCurrency(value: string): boolean {
  const normalized = value.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!normalized) return true;
  const brazilian = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(normalized);
  const decimal = /^\d+(?:\.\d{1,2})?$/.test(normalized);
  if (!brazilian && !decimal) return false;
  const parsed = Number(brazilian ? normalized.replace(/\./g, "").replace(",", ".") : normalized);
  return Number.isFinite(parsed) && parsed >= 0;
}
export function validateRecordInput(input: unknown, requireCoreFields = false): Record<string, string | null> {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(WORKBOOK_HEADERS as readonly string[]).includes(key) || (value !== null && typeof value !== "string") || (typeof value === "string" && value.length > 32767)) invalid();
    const text = typeof value === "string" ? value.trim() : "";
    // PATCH também não pode apagar campos estruturais de uma venda existente.
    if (REQUIRED_FIELDS.includes(key) && !text) invalid();
    if (key === "Mês da planilha" && text && !MONTHS.includes(text)) invalid();
    if (key === "Modelo" && text && !MODELS.includes(text)) invalid();
    if (key === "Status / Observação" && text && !STATUSES.includes(text)) invalid();
    if (key === "Data de emissão/renovação" && text && !validIsoDate(text)) invalid();
    if ((key === "Faturamento (R$)" || key === "Custo (R$)") && text && !validCurrency(text)) invalid();
    if (key === "Ano da planilha" && text && !/^\d{4}$/.test(text)) invalid();
    if (key === "Cliente" && text.length > 180) invalid();
    if (key === "Contato" && text.length > 80) invalid();
    out[key] = value as string | null;
  }
  if (!Object.keys(out).length) invalid();
  if (requireCoreFields) {
    for (const key of REQUIRED_FIELDS) {
      if (typeof out[key] !== "string" || !out[key]!.trim()) invalid();
    }
  }
  return out;
}
export function valuesFromInput(input: Record<string, string | null>): WorkbookCell[] {
  return WORKBOOK_HEADERS.map((header) => input[header] ?? null);
}
