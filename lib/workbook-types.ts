export const WORKBOOK_HEADERS = [
  "Ano da planilha",
  "Mês da planilha",
  "Cliente",
  "Contato",
  "Data de emissão/renovação",
  "Data de vencimento",
  "Modelo",
  "Faturamento (R$)",
  "Custo (R$)",
  "Status / Observação",
] as const;

export type WorkbookDateCell = {
  kind: "date";
  source: "excel" | "text" | "invalid";
  raw: string | number;
  parsed: string | null;
};

export type WorkbookCell = string | number | boolean | WorkbookDateCell | null;

export type WorkbookRecord = {
  rowNumber: number;
  values: WorkbookCell[];
  version?: string;
};

export type WorkbookData = {
  headers: string[];
  count: number;
  records: WorkbookRecord[];
  version?: string;
  source?: "github" | "local" | "mongodb";
};

export type WorkbookApiError = {
  error: {
    code: string;
    message: string;
  };
};
