import { describe, expect, it } from "vitest";
import { getWorkbookReportRows, numericCell, parseReportDate, summarizeWorkbook } from "../lib/reporting";
import { WORKBOOK_HEADERS } from "../lib/workbook-types";
import type { WorkbookData, WorkbookRecord } from "../lib/workbook-types";

function record(
  rowNumber: number,
  values: Partial<Record<(typeof WORKBOOK_HEADERS)[number], string | number | null>>,
): WorkbookRecord {
  return {
    rowNumber,
    values: WORKBOOK_HEADERS.map((header) => values[header] ?? null),
  };
}

const sample: WorkbookData = {
  headers: [...WORKBOOK_HEADERS],
  count: 5,
  records: [
    record(2, {
      "Ano da planilha": 2025, "Mês da planilha": "Janeiro", Cliente: "A",
      "Data de emissão/renovação": "2025-01-15", Modelo: "A1",
      "Faturamento (R$)": "1.234,56", "Custo (R$)": "234,56", "Status / Observação": "Ativo",
    }),
    record(3, {
      "Ano da planilha": 2025, "Mês da planilha": "Janeiro", Cliente: "B",
      "Data de emissão/renovação": "2025-01-20", Modelo: "A1",
      "Faturamento (R$)": "500.00", "Status / Observação": "Ativo",
    }),
    record(4, {
      "Ano da planilha": 2026, "Mês da planilha": "Fevereiro", Cliente: "C",
      "Data de emissão/renovação": "2026-02-10", "Custo (R$)": 15,
    }),
    record(5, {
      "Ano da planilha": 2025, "Mês da planilha": "Janeiro", Cliente: "D",
      "Data de emissão/renovação": "2025-01-21", "Faturamento (R$)": 1000,
      "Custo (R$)": 100, "Status / Observação": "Cancelado",
    }),
    record(6, { "Ano da planilha": 2025, "Mês da planilha": "Janeiro", Cliente: "TOTAL" }),
  ],
};

describe("datas dos relatórios", () => {
  it.each([
    ["2026-02-28", true],
    ["28/02/2026", true],
    ["2026-02-31", false],
    ["31/02/2026", false],
    ["2026-13-01", false],
    ["", false],
  ] as Array<[string, boolean]>)("interpreta %s sem rollover", (value, valid) => {
    const parsed = parseReportDate(value);
    expect(parsed === null).toBe(!valid);
    if (parsed) {
      expect([parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()]).toEqual([2026, 2, 28]);
    }
  });
});

describe("interpretação de valores monetários", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["R$ 1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["1.234", 1234],
    ["(1.234,56)", -1234.56],
    ["-45,90", -45.9],
    ["", 0],
    ["texto", 0],
  ])("converte %s corretamente", (input, expected) => {
    expect(numericCell(input)).toBe(expected);
  });
});

describe("relatórios agregados", () => {
  it("considera apenas vendas elegíveis e separa canceladas e registros para revisão", () => {
    const summary = summarizeWorkbook(sample, "period");

    expect(summary).toMatchObject({
      count: 4,
      eligibleCount: 2,
      excludedCount: 1,
      reviewCount: 1,
      rowsIgnored: 1,
      revenue: 1734.56,
      cost: 234.56,
      profit: 1000,
    });
    expect(summary.groups).toEqual([
      { label: "Janeiro 2025", count: 3, revenue: 1734.56, cost: 234.56, profit: 1000, eligibleCount: 2 },
      { label: "Fevereiro 2026", count: 1, revenue: 0, cost: 0, profit: 0, eligibleCount: 0 },
    ]);
  });

  it("não calcula lucro quando falta faturamento ou custo, mantendo o faturamento informado", () => {
    const summary = summarizeWorkbook(sample, "model");
    const model = summary.groups.find((group) => group.label === "A1");

    expect(model).toMatchObject({ count: 2, revenue: 1734.56, cost: 234.56, profit: 1000 });
  });

  it("mantém os agrupamentos por modelo e status sem inventar valores", () => {
    const summary = summarizeWorkbook(sample, "status");

    expect(summary.groups.map((group) => group.label)).toEqual(["Ativo", "Cancelado", "Sem preenchimento"]);
  });
});

describe("relatório detalhado", () => {
  it("mantém o mesmo critério de lucro do resumo e sinaliza custo ausente", () => {
    const rows = getWorkbookReportRows(sample);
    const rowA = rows.find((row) => row.client === "A");
    const rowB = rows.find((row) => row.client === "B");
    const rowC = rows.find((row) => row.client === "C");

    expect(rowA).toMatchObject({ revenue: 1234.56, cost: 234.56, profit: 1000, financiallyEligible: true, financialIssue: false });
    expect(rowB).toMatchObject({ revenue: 500, cost: 0, profit: 0, financiallyEligible: true, financialIssue: true });
    expect(rowC).toMatchObject({ revenue: 0, cost: 0, profit: 0, financiallyEligible: false, treatment: "Revisar" });
  });
});


describe("regra financeira por status", () => {
  it.each(["Orçamento/oferta enviada ao cliente", "Emitido", "Pendente instalar", "Instalado", "Concluido"])("inclui %s nos cálculos financeiros", (status) => {
    const data: WorkbookData = { headers: [...WORKBOOK_HEADERS], count: 1, records: [record(2, { "Ano da planilha": 2026, "Mês da planilha": "Janeiro", Cliente: "Cliente", "Data de emissão/renovação": "2026-01-15", "Faturamento (R$)": 100, "Custo (R$)": 40, "Status / Observação": status })] };
    const summary = summarizeWorkbook(data, "period"); const row = getWorkbookReportRows(data)[0];
    expect(summary.revenue).toBe(100); expect(summary.cost).toBe(40); expect(summary.profit).toBe(60); expect(summary.eligibleCount).toBe(1); expect(row.financiallyEligible).toBe(true); expect(row.treatment).toBe("Elegível");
  });
  it.each(["Cancelado", "não concluido"])("exclui %s dos cálculos", (status) => {
    const data: WorkbookData = { headers: [...WORKBOOK_HEADERS], count: 1, records: [record(2, { "Ano da planilha": 2026, "Mês da planilha": "Janeiro", Cliente: "Cliente", "Data de emissão/renovação": "2026-01-15", "Faturamento (R$)": 100, "Custo (R$)": 40, "Status / Observação": status })] };
    const summary = summarizeWorkbook(data, "period"); expect(summary.revenue).toBe(0); expect(summary.eligibleCount).toBe(0); expect(summary.excludedCount).toBe(1);
  });
  it("marca datas ISO impossíveis como divergentes", () => {
    const data: WorkbookData = { headers: [...WORKBOOK_HEADERS], count: 1, records: [record(2, { "Ano da planilha": 2026, "Mês da planilha": "Fevereiro", Cliente: "Cliente", "Data de emissão/renovação": "2026-02-31", "Status / Observação": "Emitido" })] };
    expect(getWorkbookReportRows(data)[0].dateIssue).toBe(true);
  });
});
