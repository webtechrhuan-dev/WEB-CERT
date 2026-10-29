import { describe, expect, it } from "vitest";
import { summarizeWorkbook } from "../lib/reporting";
import { WORKBOOK_HEADERS } from "../lib/workbook-types";
import type { WorkbookData } from "../lib/workbook-types";

const sample: WorkbookData = {
  headers: [...WORKBOOK_HEADERS],
  count: 3,
  records: [
    { rowNumber: 2, values: [2025, "Janeiro", "A", null, null, "A1", 100, 25, "Ativo"] },
    { rowNumber: 3, values: [2025, "Janeiro", "B", null, null, "A1", 50, null, "Ativo"] },
    { rowNumber: 4, values: [2026, "Fevereiro", "C", null, null, null, null, 15, null] },
  ],
};

describe("relatórios agregados", () => {
  it("resume registros, faturamento e custo por período sem preencher vazios", () => {
    const summary = summarizeWorkbook(sample, "period");

    expect(summary.count).toBe(3);
    expect(summary.revenue).toBe(150);
    expect(summary.cost).toBe(40);
    expect(summary.groups).toEqual([
      { label: "Fevereiro 2026", count: 1, revenue: 0, cost: 0, profit: 0, completedCount: 0 },
      { label: "Janeiro 2025", count: 2, revenue: 100, cost: 25, profit: 75, completedCount: 1 },
    ]);
  });

  it("agrupa pelo modelo e identifica campos vazios sem inventar valores", () => {
    const summary = summarizeWorkbook(sample, "model");

    expect(summary.groups).toEqual([
      { label: "A1", count: 2, revenue: 100, cost: 25, profit: 75, completedCount: 1 },
      { label: "Sem preenchimento", count: 1, revenue: 0, cost: 0, profit: 0, completedCount: 0 },
    ]);
  });
});
