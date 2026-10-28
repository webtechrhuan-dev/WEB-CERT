import type { WorkbookCell, WorkbookData, WorkbookRecord } from "@/lib/workbook-types";

export type ReportDimension = "period" | "model" | "status";

export type ReportGroup = {
  label: string;
  count: number;
  revenue: number;
  cost: number;
};

export type ReportSummary = {
  count: number;
  revenue: number;
  cost: number;
  groups: ReportGroup[];
};

const MONTHS = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function displayCell(cell: WorkbookCell | undefined): string {
  if (cell === null || cell === undefined || cell === "") {
    return "Sem preenchimento";
  }
  if (typeof cell === "object") {
    return cell.parsed ?? String(cell.raw);
  }
  return String(cell).trim();
}

function numericCell(cell: WorkbookCell | undefined): number {
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  if (typeof cell !== "string" || !cell.trim()) return 0;

  // Supports imported values such as "150", "150.00", "150,00" and "R$ 1.500,00".
  let value = cell.trim().replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleUpperCase("pt-BR");
}

/**
 * A planilha contém linhas de resumo ("TOTALIZADORES" e "Lucro Liquido").
 * Elas são úteis na planilha de origem, mas não são vendas/clientes e nunca
 * podem entrar nas somas ou contagens, pois duplicam os valores das vendas.
 */
function isCustomerRecord(record: WorkbookRecord, data: WorkbookData): boolean {
  const clientIndex = data.headers.indexOf("Cliente");
  if (clientIndex < 0) return false;
  const client = normalizedText(displayCell(record.values[clientIndex]));
  return client !== "" && client !== "SEM PREENCHIMENTO" && client !== "TOTALIZADORES" && client !== "LUCRO LIQUIDO";
}

function groupLabel(record: WorkbookRecord, data: WorkbookData, dimension: ReportDimension): string {
  const indexFor = (header: string) => data.headers.indexOf(header);
  if (dimension === "period") {
    const year = displayCell(record.values[indexFor("Ano da planilha")]);
    const month = displayCell(record.values[indexFor("Mês da planilha")]);
    return year === "Sem preenchimento" || month === "Sem preenchimento"
      ? `${year} · ${month}`
      : `${month} ${year}`;
  }
  const header = dimension === "model" ? "Modelo" : "Status / Observação";
  return displayCell(record.values[indexFor(header)]);
}

function compareGroups(left: ReportGroup, right: ReportGroup, dimension: ReportDimension): number {
  if (dimension === "period") {
    const parsePeriod = (label: string) => {
      const match = /^(.*?)\s+(\d{4})$/.exec(label);
      if (!match) return { year: Number.MAX_SAFE_INTEGER, month: Number.MAX_SAFE_INTEGER };
      const month = normalizedText(match[1]).toLocaleLowerCase("pt-BR");
      return {
        year: Number(match[2]),
        month: MONTHS.indexOf(month),
      };
    };
    const a = parsePeriod(left.label);
    const b = parsePeriod(right.label);
    return a.year - b.year || a.month - b.month || left.label.localeCompare(right.label, "pt-BR");
  }
  return left.label.localeCompare(right.label, "pt-BR", { numeric: true });
}

export function summarizeWorkbook(data: WorkbookData, dimension: ReportDimension): ReportSummary {
  const revenueIndex = data.headers.indexOf("Faturamento (R$)");
  const costIndex = data.headers.indexOf("Custo (R$)");
  const groups = new Map<string, ReportGroup>();
  let revenue = 0;
  let cost = 0;
  let count = 0;

  for (const record of data.records) {
    if (!isCustomerRecord(record, data)) continue;

    const recordRevenue = numericCell(revenueIndex >= 0 ? record.values[revenueIndex] : undefined);
    const recordCost = numericCell(costIndex >= 0 ? record.values[costIndex] : undefined);
    count += 1;
    revenue += recordRevenue;
    cost += recordCost;

    const label = groupLabel(record, data, dimension);
    const group = groups.get(label) ?? { label, count: 0, revenue: 0, cost: 0 };
    group.count += 1;
    group.revenue += recordRevenue;
    group.cost += recordCost;
    groups.set(label, group);
  }

  return {
    count,
    revenue,
    cost,
    groups: [...groups.values()].sort((left, right) => compareGroups(left, right, dimension)),
  };
}
