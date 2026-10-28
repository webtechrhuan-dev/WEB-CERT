import { describe, expect, it } from "vitest";
import { summarizeWorkbook } from "./lib/reporting";
import { WORKBOOK_HEADERS } from "./lib/workbook-types";
import type { WorkbookData } from "./lib/workbook-types";

const sample: WorkbookData = {
  headers: [...WORKBOOK_HEADERS],
  count: 5,
  records: [
    { rowNumber: 2, values: [2024, "Agosto", "CLIENTE A", "contato", "2024-08-01", "A1", 150, 75, "Feito e pago"] },
    { rowNumber: 3, values: [2024, "Agosto", "CLIENTE B", "contato", "2024-08-02", "A1", "150,00", "75,00", "Feito e pago"] },
    { rowNumber: 4, values: [2024, "Agosto", "TOTALIZADORES", null, null, null, 300, 150, null] },
    { rowNumber: 5, values: [2024, "Agosto", null, null, "Lucro Liquido", 150, null, null, null] },
    { rowNumber: 6, values: [2024, "Setembro", "CLIENTE C", "contato", "2024-09-01", "A1", 0, 0, "Perdido"] },
    { rowNumber: 7, values: [2025, "Janeiro", "CLIENTE D", null, null, "A1", 100, 25, "Ativo"] },
  ],
};

describe("relatórios agregados", () => {
  it("exclui totalizadores e linhas de lucro das contagens e somas", () => {
    const summary = summarizeWorkbook(sample, "period");
    expect(summary.count).toBe(4);
    expect(summary.revenue).toBe(400);
    expect(summary.cost).toBe(175);
    expect(summary.groups.map((group) => group.label)).toEqual([
      "Agosto 2024",
      "Setembro 2024",
      "Janeiro 2025",
    ]);
    expect(summary.groups[0]).toMatchObject({ count: 2, revenue: 300, cost: 150 });
  });

  it("agrupa somente registros de clientes por status", () => {
    const summary = summarizeWorkbook(sample, "status");
    expect(summary.count).toBe(4);
    expect(summary.groups).toContainEqual({
      label: "Feito e pago",
      count: 2,
      revenue: 300,
      cost: 150,
    });
    expect(summary.groups).toContainEqual({
      label: "Perdido",
      count: 1,
      revenue: 0,
      cost: 0,
    });
  });
});
