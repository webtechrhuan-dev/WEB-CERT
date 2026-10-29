import type { WorkbookCell, WorkbookData, WorkbookRecord } from "@/lib/workbook-types";

export type ReportDimension = "period" | "model" | "status";
export type ReportGroup = { label: string; count: number; revenue: number; cost: number; completedCount: number };
export type ReportSummary = {
  count: number;
  completedCount: number;
  excludedCount: number;
  reviewCount: number;
  revenue: number;
  cost: number;
  profit: number;
  groups: ReportGroup[];
  rowsIgnored: number;
};

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function normalizedText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleUpperCase("pt-BR");
}
function headerIndex(data: WorkbookData, name: string): number {
  const expected = normalizedText(name);
  return data.headers.findIndex((header) => normalizedText(header) === expected);
}
function displayCell(cell: WorkbookCell | undefined): string {
  if (cell === null || cell === undefined || cell === "") return "Sem preenchimento";
  if (typeof cell === "object") {
    if (cell.parsed) return cell.parsed;
    const raw = String(cell.raw ?? "").trim();
    return raw || "Sem preenchimento";
  }
  const value = String(cell).trim();
  return value || "Sem preenchimento";
}

/** Interpreta valores monetários brasileiros e internacionais. */
export function numericCell(cell: WorkbookCell | undefined): number {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : 0;
  if (typeof cell !== "string" || !cell.trim()) return 0;
  let value = cell.trim().replace(/R\$|\s/gi, "").replace(/[−–]/g, "-");
  const negativeByParentheses = /^\(.*\)$/.test(value);
  value = value.replace(/[()]/g, "").replace(/[^\d,.-]/g, "");
  if (!value || value === "-" || value === "." || value === ",") return 0;
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) value = comma > dot ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  else if (comma >= 0) {
    const decimals = value.length - comma - 1;
    value = decimals > 0 && decimals <= 2 ? value.replace(",", ".") : value.replace(/,/g, "");
  } else if (dot >= 0) {
    const decimals = value.length - dot - 1;
    if (decimals === 3 && /^-?\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, "");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return negativeByParentheses ? -Math.abs(parsed) : parsed;
}

function isCustomerRecord(record: WorkbookRecord, data: WorkbookData): boolean {
  const index = headerIndex(data, "Cliente");
  if (index < 0) return false;
  const client = normalizedText(displayCell(record.values[index]));
  if (!client || client === "SEM PREENCHIMENTO") return false;
  // Exclui totalizadores e linhas de lucro que não representam vendas individuais.
  if (/\b(TOTAL|TOTALIZADORES|SUBTOTAL|LUCRO|FATURAMENTO TOTAL|CUSTO TOTAL)\b/.test(client)) return false;
  return true;
}

type FinancialTreatment = "completed" | "excluded" | "review";
function financialTreatment(record: WorkbookRecord, data: WorkbookData): FinancialTreatment {
  const status = normalizedText(displayCell(record.values[headerIndex(data, "Status / Observação")]));
  const year = Number(displayCell(record.values[headerIndex(data, "Ano da planilha")]));
  if (status === "SEM PREENCHIMENTO") {
    // Os arquivos de 2024/2025 são registros históricos sem campo de status.
    // Em 2026, status vazio é ambíguo e não deve entrar no financeiro automaticamente.
    return Number.isFinite(year) && year < 2026 ? "completed" : "review";
  }
  if (/^(FEITO E PAGO|CONCLUIDO|CONCLUIDA|PAGO|PAGA|FINALIZADO|FINALIZADA)$/.test(status)) return "completed";
  if (/\b(PERDIDO|CANCELADO|CANCELADA|AGENDADO|AGENDADA|OFERTA ENVIADA|ORCAMENTO|ORÇAMENTO|PROPOSTA|PENDENTE|EM ABERTO)\b/.test(status)) return "excluded";
  // Status desconhecido não deve ser tratado como venda concluída por suposição.
  return "review";
}

function groupLabel(record: WorkbookRecord, data: WorkbookData, dimension: ReportDimension): string {
  if (dimension === "period") {
    const year = displayCell(record.values[headerIndex(data, "Ano da planilha")]);
    const month = displayCell(record.values[headerIndex(data, "Mês da planilha")]);
    return year === "Sem preenchimento" || month === "Sem preenchimento" ? "Período não informado" : `${month} ${year}`;
  }
  return displayCell(record.values[headerIndex(data, dimension === "model" ? "Modelo" : "Status / Observação")]);
}
function compareGroups(left: ReportGroup, right: ReportGroup, dimension: ReportDimension): number {
  if (dimension === "period") {
    const parse = (label: string) => {
      const match = /^(.*?)\s+(\d{4})$/.exec(label);
      if (!match) return { year: Number.MAX_SAFE_INTEGER, month: Number.MAX_SAFE_INTEGER };
      return { year: Number(match[2]), month: MONTHS.indexOf(normalizedText(match[1]).toLocaleLowerCase("pt-BR")) };
    };
    const a = parse(left.label), b = parse(right.label);
    return a.year - b.year || a.month - b.month || left.label.localeCompare(right.label, "pt-BR");
  }
  return left.label.localeCompare(right.label, "pt-BR", { numeric: true });
}
export function summarizeWorkbook(data: WorkbookData, dimension: ReportDimension): ReportSummary {
  const revenueIndex = headerIndex(data, "Faturamento (R$)");
  const costIndex = headerIndex(data, "Custo (R$)");
  const groups = new Map<string, ReportGroup>();
  let revenue = 0, cost = 0, count = 0, completedCount = 0, excludedCount = 0, reviewCount = 0, rowsIgnored = 0;
  for (const record of data.records) {
    if (!isCustomerRecord(record, data)) { rowsIgnored += 1; continue; }
    count += 1;
    const treatment = financialTreatment(record, data);
    if (treatment === "excluded") excludedCount += 1;
    if (treatment === "review") reviewCount += 1;
    const recordRevenue = treatment === "completed" ? numericCell(revenueIndex >= 0 ? record.values[revenueIndex] : undefined) : 0;
    const recordCost = treatment === "completed" ? numericCell(costIndex >= 0 ? record.values[costIndex] : undefined) : 0;
    if (treatment === "completed") {
      completedCount += 1;
      revenue += recordRevenue;
      cost += recordCost;
    }
    const label = groupLabel(record, data, dimension);
    const group = groups.get(label) ?? { label, count: 0, revenue: 0, cost: 0, completedCount: 0 };
    group.count += 1;
    if (treatment === "completed") {
      group.completedCount += 1;
      group.revenue += recordRevenue;
      group.cost += recordCost;
    }
    groups.set(label, group);
  }
  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  return {
    count, completedCount, excludedCount, reviewCount, revenue: roundMoney(revenue), cost: roundMoney(cost),
    profit: roundMoney(revenue - cost), rowsIgnored,
    groups: [...groups.values()].map((group) => ({ ...group, revenue: roundMoney(group.revenue), cost: roundMoney(group.cost) })).sort((a, b) => compareGroups(a, b, dimension)),
  };
}
