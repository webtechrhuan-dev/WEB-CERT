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

function displayCell(cell: WorkbookCell | undefined): string {
  if (cell === null || cell === undefined || cell === "") {
    return "Sem preenchimento";
  }
  if (typeof cell === "object") {
    return cell.parsed ?? String(cell.raw);
  }
  return String(cell);
}

function numericCell(cell: WorkbookCell | undefined): number {
  return typeof cell === "number" && Number.isFinite(cell) ? cell : 0;
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

export function summarizeWorkbook(
  data: WorkbookData,
  dimension: ReportDimension,
): ReportSummary {
  const revenueIndex = data.headers.indexOf("Faturamento (R$)");
  const costIndex = data.headers.indexOf("Custo (R$)");
  const groups = new Map<string, ReportGroup>();
  let revenue = 0;
  let cost = 0;

  for (const record of data.records) {
    const recordRevenue = numericCell(record.values[revenueIndex]);
    const recordCost = numericCell(record.values[costIndex]);
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
    count: data.records.length,
    revenue,
    cost,
    groups: [...groups.values()].sort((left, right) =>
      left.label.localeCompare(right.label, "pt-BR", { numeric: true }),
    ),
  };
}
