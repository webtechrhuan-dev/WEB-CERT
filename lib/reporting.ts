import type { WorkbookCell, WorkbookData, WorkbookRecord } from "@/lib/workbook-types";

export type ReportDimension = "period" | "model" | "status";
export type ReportGranularity = "month" | "week" | "year";
export type ReportDateBasis = "issue" | "competence";
export type ReportTreatment = "Concluída" | "Não concluída" | "Revisar";
export type ReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  dateBasis?: ReportDateBasis;
  model?: string;
  treatment?: ReportTreatment | "all";
};
export type ReportGroup = {
  label: string;
  count: number;
  completedCount: number;
  excludedCount: number;
  reviewCount: number;
  revenue: number;
  cost: number;
  profit: number;
};
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

type CalendarDate = { year: number; month: number; day: number; iso: string };

/** Converte datas sem depender do fuso horário local do navegador/servidor. */
export function parseReportDate(value: string): CalendarDate | null {
  const raw = value.trim();
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(raw);
  const brMatch = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(raw);
  if (!isoMatch && !brMatch) return null;

  const year = Number(isoMatch ? isoMatch[1] : brMatch![3]);
  const month = Number(isoMatch ? isoMatch[2] : brMatch![2]);
  const day = Number(isoMatch ? isoMatch[3] : brMatch![1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(year) || year < 1000 ||
    !Number.isInteger(month) || month < 1 || month > 12 ||
    !Number.isInteger(day) || day < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  return {
    year,
    month,
    day,
    iso: String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0"),
  };
}

function dateCellValue(cell: WorkbookCell | undefined): { display: string; iso: string | null } {
  const raw = typeof cell === "object" && cell !== null && "kind" in cell
    ? cell.parsed ?? cell.raw
    : cell;
  const display = raw === null || raw === undefined || String(raw).trim() === ""
    ? "Sem preenchimento"
    : String(raw).trim();
  const parsed = parseReportDate(String(raw ?? ""));
  return { display: parsed?.iso ?? display, iso: parsed?.iso ?? null };
}

/** Interpreta valores monetários brasileiros e internacionais. */
export function numericCell(cell: WorkbookCell | undefined): number {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : 0;
  if (typeof cell !== "string" || !cell.trim()) return 0;
  let value = cell.trim().replace(/R\$|\s/gi, "").replace(/[−–]/g, "-");
  const negativeByParentheses = /^(\(.*\))$/.test(value);
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
  if (/\b(TOTAL|TOTALIZADORES|SUBTOTAL|LUCRO|FATURAMENTO TOTAL|CUSTO TOTAL)\b/.test(client)) return false;
  return true;
}

type FinancialTreatment = "completed" | "excluded" | "review";

function hasMoneyValue(cell: WorkbookCell | undefined): boolean {
  return cell !== null && cell !== undefined && String(cell).trim() !== "";
}

function financialTreatment(record: WorkbookRecord, data: WorkbookData): FinancialTreatment {
  const status = normalizedText(displayCell(record.values[headerIndex(data, "Status / Observação")]));
  const year = Number(displayCell(record.values[headerIndex(data, "Ano da planilha")]));
  // Cancelados e não concluídos nunca entram nos totais financeiros.
  // Registros legados sem status (2024/2025) continuam válidos; a partir de 2026 vão para revisão.
  if (/^(CANCELADO|CANCELADA|NAO CONCLUIDO|NAO CONCLUIDA)$/.test(status)) return "excluded";
  if (status === "SEM PREENCHIMENTO" && (!Number.isFinite(year) || year >= 2026)) return "review";
  return "completed";
}

function groupLabel(record: WorkbookRecord, data: WorkbookData, dimension: ReportDimension): string {
  if (dimension === "period") {
    const year = displayCell(record.values[headerIndex(data, "Ano da planilha")]);
    const month = displayCell(record.values[headerIndex(data, "Mês da planilha")]);
    return year === "Sem preenchimento" || month === "Sem preenchimento" ? "Período não informado" : month + " " + year;
  }
  return displayCell(record.values[headerIndex(data, dimension === "model" ? "Modelo" : "Status / Observação")]);
}

function monthIndex(value: string): number {
  return MONTHS.indexOf(normalizedText(value).toLocaleLowerCase("pt-BR"));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function compareGroups(left: ReportGroup, right: ReportGroup, dimension: ReportDimension): number {
  if (dimension === "period") {
    const parse = (label: string) => {
      const match = /^(.*?)\s+(\d{4})$/.exec(label);
      if (!match) return { year: Number.MAX_SAFE_INTEGER, month: Number.MAX_SAFE_INTEGER };
      return { year: Number(match[2]), month: monthIndex(match[1]) };
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
  let revenue = 0, cost = 0, profit = 0, count = 0, completedCount = 0, excludedCount = 0, reviewCount = 0, rowsIgnored = 0;

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
      const hasRevenue = hasMoneyValue(revenueIndex >= 0 ? record.values[revenueIndex] : undefined);
      revenue += hasRevenue ? recordRevenue : 0;
      cost += recordCost;
      if (hasRevenue && hasMoneyValue(costIndex >= 0 ? record.values[costIndex] : undefined)) profit += recordRevenue - recordCost;
    }

    const label = groupLabel(record, data, dimension);
    const group = groups.get(label) ?? {
      label, count: 0, completedCount: 0, excludedCount: 0, reviewCount: 0,
      revenue: 0, cost: 0, profit: 0,
    };
    group.count += 1;
    if (treatment === "excluded") group.excludedCount += 1;
    if (treatment === "review") group.reviewCount += 1;
    if (treatment === "completed") {
      group.completedCount += 1;
      const hasRevenue = hasMoneyValue(revenueIndex >= 0 ? record.values[revenueIndex] : undefined);
      group.revenue += hasRevenue ? recordRevenue : 0;
      group.cost += recordCost;
      if (hasRevenue && hasMoneyValue(costIndex >= 0 ? record.values[costIndex] : undefined)) group.profit += recordRevenue - recordCost;
    }
    groups.set(label, group);
  }

  return {
    count, completedCount, excludedCount, reviewCount,
    revenue: roundMoney(revenue), cost: roundMoney(cost), profit: roundMoney(profit), rowsIgnored,
    groups: [...groups.values()]
      .map((group) => ({ ...group, revenue: roundMoney(group.revenue), cost: roundMoney(group.cost), profit: roundMoney(group.profit) }))
      .sort((a, b) => compareGroups(a, b, dimension)),
  };
}

export type DetailedReportRow = {
  id: string;
  client: string;
  contact: string;
  date: string;
  issueDateIso: string | null;
  competenceDateIso: string | null;
  year: string;
  month: string;
  model: string;
  status: string;
  revenue: number;
  cost: number;
  profit: number;
  completed: boolean;
  treatment: ReportTreatment;
  financialIssue: boolean;
  dateIssue: boolean;
};

export function getWorkbookReportRows(data: WorkbookData): DetailedReportRow[] {
  const index = (name: string) => headerIndex(data, name);
  return data.records.filter((record) => isCustomerRecord(record, data)).map((record) => {
    const value = (name: string) => displayCell(record.values[index(name)]);
    const treatment = financialTreatment(record, data);
    const dateValue = dateCellValue(record.values[index("Data de emissão/renovação")]);
    const completed = treatment === "completed";
    const yearText = value("Ano da planilha");
    const monthText = value("Mês da planilha");
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN;
    const month = monthIndex(monthText) + 1;
    const competenceDateIso = Number.isFinite(year) && month >= 1 && month <= 12
      ? String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-01"
      : null;
    const issueDate = dateValue.iso ? parseReportDate(dateValue.iso) : null;
    const dateIssue = !issueDate || !competenceDateIso || issueDate.year !== year || issueDate.month !== month;
    const status = normalizedText(value("Status / Observação"));
    const baseWouldBeCompleted = !/^(CANCELADO|CANCELADA|NAO CONCLUIDO|NAO CONCLUIDA)$/.test(status) &&
      !(status === "SEM PREENCHIMENTO" && (!Number.isFinite(year) || year >= 2026));
    const hasRevenue = hasMoneyValue(record.values[index("Faturamento (R$)")]);
    const hasCost = hasMoneyValue(record.values[index("Custo (R$)")]);

    return {
      id: String(record.rowNumber),
      client: value("Cliente"),
      contact: value("Contato"),
      date: dateValue.display === "Sem preenchimento" ? "" : dateValue.display,
      issueDateIso: issueDate?.iso ?? null,
      competenceDateIso,
      year: yearText,
      month: monthText,
      model: value("Modelo"),
      status: value("Status / Observação"),
      revenue: completed && hasRevenue ? numericCell(record.values[index("Faturamento (R$)")]) : 0,
      cost: completed && hasCost ? numericCell(record.values[index("Custo (R$)")]) : 0,
      profit: completed && hasRevenue && hasCost
        ? numericCell(record.values[index("Faturamento (R$)")]) - numericCell(record.values[index("Custo (R$)")])
        : 0,
      completed,
      treatment: completed ? "Concluída" : treatment === "excluded" ? "Não concluída" : "Revisar",
      financialIssue: baseWouldBeCompleted && (!hasRevenue || !hasCost),
      dateIssue,
    };
  });
}

function competenceMonthEnd(competenceDateIso: string): string | null {
  const parsed = parseReportDate(competenceDateIso);
  if (!parsed) return null;
  const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  return String(parsed.year).padStart(4, "0") + "-" + String(parsed.month).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0");
}

/** Aplica todos os filtros do relatório a uma única coleção de linhas. */
export function filterReportRows(rows: DetailedReportRow[], filters: ReportFilters): DetailedReportRow[] {
  const dateFrom = filters.dateFrom ? parseReportDate(filters.dateFrom)?.iso : undefined;
  const dateTo = filters.dateTo ? parseReportDate(filters.dateTo)?.iso : undefined;
  if ((filters.dateFrom && !dateFrom) || (filters.dateTo && !dateTo)) return [];
  const dateBasis = filters.dateBasis ?? "issue";
  const model = filters.model && filters.model !== "all" ? filters.model : null;
  const treatment = filters.treatment && filters.treatment !== "all" ? filters.treatment : null;

  return rows.filter((row) => {
    if (dateFrom || dateTo) {
      if (dateBasis === "competence") {
        const start = row.competenceDateIso;
        const end = start ? competenceMonthEnd(start) : null;
        if (!start || !end || (dateFrom && end < dateFrom) || (dateTo && start > dateTo)) return false;
      } else {
        const date = row.issueDateIso;
        if (!date || (dateFrom && date < dateFrom) || (dateTo && date > dateTo)) return false;
      }
    }
    if (model && row.model !== model) return false;
    if (treatment && row.treatment !== treatment) return false;
    return true;
  });
}

export function summarizeReportRows(rows: DetailedReportRow[]) {
  const completed = rows.filter((row) => row.completed);
  return {
    count: rows.length,
    completedCount: completed.length,
    excludedCount: rows.filter((row) => row.treatment === "Não concluída").length,
    reviewCount: rows.filter((row) => row.treatment === "Revisar").length,
    revenue: roundMoney(completed.reduce((sum, row) => sum + row.revenue, 0)),
    cost: roundMoney(completed.reduce((sum, row) => sum + row.cost, 0)),
    profit: roundMoney(completed.reduce((sum, row) => sum + row.profit, 0)),
  };
}

export function countReportDateIssues(rows: DetailedReportRow[]): number {
  return rows.filter((row) => row.dateIssue).length;
}

function displayValue(value: string): string {
  return value && value !== "Sem preenchimento" ? value : "Não informado";
}

export function getReportPeriodLabel(row: DetailedReportRow, granularity: ReportGranularity): string {
  const issueDate = row.issueDateIso ? parseReportDate(row.issueDateIso) : null;
  const year = /^\d{4}$/.test(row.year.trim()) ? Number(row.year.trim()) : NaN;
  const month = monthIndex(row.month) + 1;

  if (granularity === "year") {
    return Number.isFinite(year) ? String(year) : issueDate ? String(issueDate.year) : "Ano não informado";
  }
  if (granularity === "month") {
    if (Number.isFinite(year) && month >= 1 && month <= 12) return MONTHS[month - 1] + " " + String(year);
    return issueDate ? MONTHS[issueDate.month - 1] + " " + String(issueDate.year) : "Período não informado";
  }
  if (!issueDate) return "Semana sem data · " + displayValue(row.month) + " " + displayValue(row.year);

  const utcDate = new Date(Date.UTC(issueDate.year, issueDate.month - 1, issueDate.day));
  const mondayOffset = (utcDate.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(issueDate.year, issueDate.month - 1, issueDate.day - mondayOffset));
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));
  const format = (date: Date) =>
    String(date.getUTCDate()).padStart(2, "0") + "/" +
    String(date.getUTCMonth() + 1).padStart(2, "0") + "/" +
    String(date.getUTCFullYear());
  return format(monday) + " – " + format(sunday);
}

export function getReportGroupLabel(
  row: DetailedReportRow,
  dimension: ReportDimension,
  granularity: ReportGranularity,
): string {
  if (dimension === "period") return getReportPeriodLabel(row, granularity);
  if (dimension === "model") return displayValue(row.model);
  return displayValue(row.status);
}

/** Agrupa linhas já filtradas; o resumo, a tabela e o gráfico usam a mesma regra. */
export function buildReportGroups(
  rows: DetailedReportRow[],
  dimension: ReportDimension,
  granularity: ReportGranularity,
): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  rows.forEach((row) => {
    const label = getReportGroupLabel(row, dimension, granularity);
    const group = groups.get(label) ?? {
      label, count: 0, completedCount: 0, excludedCount: 0, reviewCount: 0,
      revenue: 0, cost: 0, profit: 0,
    };
    group.count += 1;
    if (row.treatment === "Não concluída") group.excludedCount += 1;
    if (row.treatment === "Revisar") group.reviewCount += 1;
    if (row.completed) {
      group.completedCount += 1;
      group.revenue += row.revenue;
      group.cost += row.cost;
      group.profit += row.profit;
    }
    groups.set(label, group);
  });

  const result = [...groups.values()].map((group) => ({
    ...group,
    revenue: roundMoney(group.revenue),
    cost: roundMoney(group.cost),
    profit: roundMoney(group.profit),
  }));

  if (dimension !== "period") return result.sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
  const sortValue = (label: string): number => {
    if (granularity === "year") return /^\d{4}$/.test(label) ? Number(label) : Number.MAX_SAFE_INTEGER;
    if (granularity === "week") {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(label);
      if (!match) return Number.MAX_SAFE_INTEGER;
      const parsed = parseReportDate(match[0]);
      return parsed ? Date.UTC(parsed.year, parsed.month - 1, parsed.day) : Number.MAX_SAFE_INTEGER;
    }
    const match = /^(.*?)\s+(\d{4})$/.exec(label);
    if (!match) return Number.MAX_SAFE_INTEGER;
    return Number(match[2]) * 12 + monthIndex(match[1]);
  };
  return result.sort((a, b) => sortValue(a.label) - sortValue(b.label) || a.label.localeCompare(b.label, "pt-BR"));
}

/** Escalas usadas pelo gráfico combinado, separando moeda e quantidade. */
export function getReportChartScale(groups: ReportGroup[]) {
  const minProfit = Math.min(0, ...groups.map((group) => group.profit));
  const maxMoneyValue = Math.max(1, ...groups.flatMap((group) => [group.revenue, group.cost, group.profit]));
  const maxCountValue = Math.max(1, ...groups.map((group) => group.count));
  return {
    minMoney: minProfit * 1.15,
    maxMoney: maxMoneyValue * 1.15,
    maxCount: maxCountValue * 1.2,
  };
}
