import { describe, expect, it } from "vitest";
import {
  buildReportGroups,
  countReportDateIssues,
  filterReportRows,
  getReportChartScale,
  getReportPeriodLabel,
  getWorkbookReportRows,
  numericCell,
  parseReportDate,
  summarizeReportRows,
  summarizeWorkbook,
  type ReportGroup,
} from "../lib/reporting";
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
  it("considera vendas elegíveis e separa canceladas e registros para revisão", () => {
    const summary = summarizeWorkbook(sample, "period");

    expect(summary).toMatchObject({
      count: 4,
      completedCount: 2,
      excludedCount: 1,
      reviewCount: 1,
      rowsIgnored: 1,
      revenue: 1734.56,
      cost: 234.56,
      profit: 1000,
    });
    expect(summary.groups).toEqual([
      {
        label: "Janeiro 2025", count: 3, completedCount: 2, excludedCount: 1, reviewCount: 0,
        revenue: 1734.56, cost: 234.56, profit: 1000,
      },
      {
        label: "Fevereiro 2026", count: 1, completedCount: 0, excludedCount: 0, reviewCount: 1,
        revenue: 0, cost: 0, profit: 0,
      },
    ]);
  });

  it("mantém cancelados e não concluídos fora do financeiro e conta pendente instalar", () => {
    const data: WorkbookData = {
      headers: [...WORKBOOK_HEADERS],
      count: 3,
      records: [
        record(2, {
          "Ano da planilha": 2026, "Mês da planilha": "Março", Cliente: "Cancelado",
          "Data de emissão/renovação": "2026-03-02", "Faturamento (R$)": 1000,
          "Custo (R$)": 100, "Status / Observação": "Cancelado",
        }),
        record(3, {
          "Ano da planilha": 2026, "Mês da planilha": "Março", Cliente: "Não concluído",
          "Data de emissão/renovação": "2026-03-03", "Faturamento (R$)": 2000,
          "Custo (R$)": 200, "Status / Observação": "não concluido",
        }),
        record(4, {
          "Ano da planilha": 2026, "Mês da planilha": "Março", Cliente: "Pendente",
          "Data de emissão/renovação": "2026-03-04", "Faturamento (R$)": 300,
          "Custo (R$)": 100, "Status / Observação": "Pendente instalar",
        }),
      ],
    };
    expect(summarizeWorkbook(data, "period")).toMatchObject({
      count: 3, completedCount: 1, excludedCount: 2, reviewCount: 0,
      revenue: 300, cost: 100, profit: 200,
    });
  });

  it("não calcula lucro quando falta faturamento ou custo, mantendo o valor informado", () => {
    const summary = summarizeWorkbook(sample, "model");
    const model = summary.groups.find((group) => group.label === "A1");

    expect(model).toMatchObject({ count: 2, revenue: 1734.56, cost: 234.56, profit: 1000 });
  });

  it("mantém os agrupamentos por modelo e status sem inventar valores", () => {
    const summary = summarizeWorkbook(sample, "status");
    expect(summary.groups.map((group) => group.label)).toEqual(["Ativo", "Cancelado", "Sem preenchimento"]);
  });
});

describe("datas e períodos", () => {
  it("interpreta datas ISO e brasileiras sem deslocamento de fuso", () => {
    expect(parseReportDate("2025-02-01")).toMatchObject({ year: 2025, month: 2, day: 1, iso: "2025-02-01" });
    expect(parseReportDate("01/02/2025")).toMatchObject({ year: 2025, month: 2, day: 1, iso: "2025-02-01" });
    expect(parseReportDate("31/02/2025")).toBeNull();
  });

  it("não marca o primeiro dia do mês como divergente por causa do fuso horário", () => {
    const data: WorkbookData = {
      ...sample,
      records: [...sample.records, record(7, {
        "Ano da planilha": 2025, "Mês da planilha": "Janeiro", Cliente: "Primeiro dia",
        "Data de emissão/renovação": "2025-01-01", "Faturamento (R$)": 10,
        "Custo (R$)": 5, "Status / Observação": "Emitido",
      })],
    };
    const row = getWorkbookReportRows(data).find((item) => item.client === "Primeiro dia");
    expect(row).toMatchObject({ issueDateIso: "2025-01-01", competenceDateIso: "2025-01-01", dateIssue: false });
  });

  it("mantém a competência da pasta no agrupamento mensal e usa emissão nas semanas", () => {
    const data: WorkbookData = {
      ...sample,
      records: [...sample.records, record(7, {
        "Ano da planilha": 2026, "Mês da planilha": "Janeiro", Cliente: "Data divergente",
        "Data de emissão/renovação": "2025-02-05", Modelo: "A1",
        "Faturamento (R$)": 100, "Custo (R$)": 50, "Status / Observação": "Emitido",
      })],
    };
    const row = getWorkbookReportRows(data).find((item) => item.client === "Data divergente")!;
    expect(row.dateIssue).toBe(true);
    expect(getReportPeriodLabel(row, "month")).toBe("janeiro 2026");
    expect(getReportPeriodLabel(row, "week")).toBe("03/02/2025 – 09/02/2025");
  });
});

describe("filtros e consistência dos relatórios", () => {
  const dataWithMismatch: WorkbookData = {
    ...sample,
    records: [...sample.records, record(7, {
      "Ano da planilha": 2026, "Mês da planilha": "Janeiro", Cliente: "Data divergente",
      "Data de emissão/renovação": "2025-02-05", Modelo: "A1",
      "Faturamento (R$)": 100, "Custo (R$)": 50, "Status / Observação": "Emitido",
    })],
  };

  it("permite escolher entre filtrar pela emissão e pela competência da pasta", () => {
    const rows = getWorkbookReportRows(dataWithMismatch);
    const byIssueDate = filterReportRows(rows, {
      dateFrom: "2025-02-01", dateTo: "2025-02-28", dateBasis: "issue",
    });
    const byCompetence = filterReportRows(rows, {
      dateFrom: "2025-02-01", dateTo: "2025-02-28", dateBasis: "competence",
    });

    expect(byIssueDate.map((row) => row.client)).toEqual(["Data divergente"]);
    expect(byCompetence).toHaveLength(0);
    expect(countReportDateIssues(byIssueDate)).toBe(1);
  });

  it("aplica filtros de modelo e situação antes de calcular o indicador de datas", () => {
    const rows = getWorkbookReportRows(dataWithMismatch);
    const filtered = filterReportRows(rows, {
      model: "A1",
      treatment: "Concluída",
      dateFrom: "2025-02-01",
      dateTo: "2025-02-28",
      dateBasis: "issue",
    });
    expect(filtered.map((row) => row.client)).toEqual(["Data divergente"]);
    expect(countReportDateIssues(filtered)).toBe(1);
    expect(countReportDateIssues(filterReportRows(rows, { model: "A1", treatment: "Não concluída" }))).toBe(0);
  });

  it("mantém totais dos cartões, tabela e agrupamento mensal consistentes após os filtros", () => {
    const rows = getWorkbookReportRows(sample);
    const filtered = filterReportRows(rows, {
      dateFrom: "2025-01-01",
      dateTo: "2025-01-31",
      dateBasis: "competence",
    });
    const summary = summarizeReportRows(filtered);
    const groups = buildReportGroups(filtered, "period", "month");

    expect(summary).toMatchObject({
      count: 3, completedCount: 2, excludedCount: 1, reviewCount: 0,
      revenue: 1734.56, cost: 234.56, profit: 1000,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      label: "janeiro 2025", count: summary.count, completedCount: summary.completedCount,
      excludedCount: summary.excludedCount, reviewCount: summary.reviewCount,
      revenue: summary.revenue, cost: summary.cost, profit: summary.profit,
    });
  });
});

describe("escala do gráfico combinado", () => {
  it("preserva espaço para resultado negativo e usa escala separada de quantidade", () => {
    const groups: ReportGroup[] = [{
      label: "janeiro 2026", count: 4, completedCount: 1, excludedCount: 1, reviewCount: 2,
      revenue: 100, cost: 150, profit: -50,
    }];
    const scale = getReportChartScale(groups);
    expect(scale.minMoney).toBeCloseTo(-57.5);
    expect(scale.maxMoney).toBeCloseTo(172.5);
    expect(scale.maxCount).toBeCloseTo(4.8);
  });

  it("retorna escalas seguras para o estado vazio", () => {
    expect(getReportChartScale([])).toEqual({ minMoney: 0, maxMoney: 1.15, maxCount: 1.2 });
  });
});

describe("relatório detalhado", () => {
  it("mantém o mesmo critério de lucro do resumo e sinaliza custo ausente", () => {
    const rows = getWorkbookReportRows(sample);
    const rowA = rows.find((row) => row.client === "A");
    const rowB = rows.find((row) => row.client === "B");
    const rowC = rows.find((row) => row.client === "C");

    expect(rowA).toMatchObject({ revenue: 1234.56, cost: 234.56, profit: 1000, completed: true, financialIssue: false });
    expect(rowB).toMatchObject({ revenue: 500, cost: 0, profit: 0, completed: true, financialIssue: true });
    expect(rowC).toMatchObject({ revenue: 0, cost: 0, profit: 0, completed: false, treatment: "Revisar" });
  });
});
