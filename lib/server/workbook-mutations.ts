import "server-only";

import ExcelJS from "exceljs";
import {
  getWorksheetHeaders,
  loadWorkbookBuffer,
  parseWorkbookBuffer,
  WORKBOOK_HEADERS,
} from "@/lib/server/workbook";
import type { WorkbookCell } from "@/lib/workbook-types";

export type EditableValues = Partial<Record<(typeof WORKBOOK_HEADERS)[number], string | null>>;

export type WorkbookMutationErrorCode =
  | "INVALID_INPUT"
  | "RECORD_NOT_FOUND"
  | "INVALID_WORKBOOK";

export class WorkbookMutationError extends Error {
  constructor(public readonly code: WorkbookMutationErrorCode) {
    super("Não foi possível validar a alteração.");
    this.name = "WorkbookMutationError";
  }
}

function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new WorkbookMutationError("INVALID_INPUT");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new WorkbookMutationError("INVALID_INPUT");
  }
  return date;
}

function parseCurrency(value: string): number {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) {
    throw new WorkbookMutationError("INVALID_INPUT");
  }

  const brazilian = /^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(
    normalized,
  );
  const decimal = /^\d+(?:\.\d{1,2})?$/.test(normalized);
  if (!brazilian && !decimal) {
    throw new WorkbookMutationError("INVALID_INPUT");
  }

  const amount = Number(
    brazilian
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized,
  );
  if (!Number.isFinite(amount) || amount < 0) {
    throw new WorkbookMutationError("INVALID_INPUT");
  }
  return amount;
}

function parseValue(header: string, value: string | null): string | number | Date | null {
  if (value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new WorkbookMutationError("INVALID_INPUT");
  }
  if (value.length > 32_767) {
    throw new WorkbookMutationError("INVALID_INPUT");
  }

  if (header === "Ano da planilha") {
    if (!/^\d{4}$/.test(value)) {
      throw new WorkbookMutationError("INVALID_INPUT");
    }
    return Number(value);
  }
  if (header === "Data de emissão/renovação") {
    return parseDate(value);
  }
  if (header === "Faturamento (R$)" || header === "Custo (R$)") {
    return parseCurrency(value);
  }
  return value;
}

function validateValues(values: unknown, requireNonEmpty = false): EditableValues {
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new WorkbookMutationError("INVALID_INPUT");
  }

  const entries = Object.entries(values);
  if (entries.length === 0) {
    throw new WorkbookMutationError("INVALID_INPUT");
  }

  const result: EditableValues = {};
  for (const [header, value] of entries) {
    if (
      !WORKBOOK_HEADERS.includes(header as (typeof WORKBOOK_HEADERS)[number]) ||
      (typeof value !== "string" && value !== null)
    ) {
      throw new WorkbookMutationError("INVALID_INPUT");
    }
    result[header as (typeof WORKBOOK_HEADERS)[number]] = value;
  }
  if (
    requireNonEmpty &&
    !entries.some(([, value]) => typeof value === "string" && value.trim() !== "")
  ) {
    throw new WorkbookMutationError("INVALID_INPUT");
  }
  return result;
}

function tableForWorksheet(worksheet: ExcelJS.Worksheet) {
  const tables = worksheet.getTables();
  return tables.length === 1 ? tables[0] : null;
}

async function serializeAndValidate(
  workbook: ExcelJS.Workbook,
  expectedCount: number,
  preserveRecords: Array<{ rowNumber: number; values: WorkbookCell[] }>,
  changedRowNumber?: number,
): Promise<Buffer> {
  let output: Buffer;
  try {
    output = Buffer.from(await workbook.xlsx.writeBuffer());
    const validated = await parseWorkbookBuffer(output);
    if (
      validated.count !== expectedCount ||
      validated.headers.join("\u0000") !== WORKBOOK_HEADERS.join("\u0000")
    ) {
      throw new WorkbookMutationError("INVALID_WORKBOOK");
    }

    const preserved = new Map(
      validated.records
        .filter((record) => record.rowNumber !== changedRowNumber)
        .map((record) => [record.rowNumber, JSON.stringify(record.values)]),
    );
    for (const record of preserveRecords) {
      if (
        record.rowNumber !== changedRowNumber &&
        preserved.get(record.rowNumber) !== JSON.stringify(record.values)
      ) {
        throw new WorkbookMutationError("INVALID_WORKBOOK");
      }
    }
  } catch (error) {
    if (error instanceof WorkbookMutationError) {
      throw error;
    }
    throw new WorkbookMutationError("INVALID_WORKBOOK");
  }

  if (output.length === 0) {
    throw new WorkbookMutationError("INVALID_WORKBOOK");
  }
  return output;
}

export async function createWorkbookRecord(
  buffer: Buffer,
  input: unknown,
): Promise<Buffer> {
  const values = validateValues(input, true);
  const originalData = await parseWorkbookBuffer(buffer);
  const workbook = await loadWorkbookBuffer(buffer);
  const worksheet = workbook.getWorksheet("Todos os dados");
  if (!worksheet) {
    throw new WorkbookMutationError("INVALID_WORKBOOK");
  }

  const headers = getWorksheetHeaders(worksheet);
  const row = headers.map((header) =>
    parseValue(
      header,
      values[header as (typeof WORKBOOK_HEADERS)[number]] ?? null,
    ),
  );
  const newRow = worksheet.addRow(row);
  const templateRow = worksheet.getRow(2);
  headers.forEach((_, index) => {
    newRow.getCell(index + 1).style = structuredClone(
      templateRow.getCell(index + 1).style,
    );
  });

  const table = tableForWorksheet(worksheet);
  if (!table) {
    throw new WorkbookMutationError("INVALID_WORKBOOK");
  }
  const lastColumn = worksheet.getColumn(headers.length).letter;
  const newTableRef = `A1:${lastColumn}${worksheet.rowCount}`;
  table.table.tableRef = newTableRef;
  table.table.autoFilterRef = newTableRef;

  return serializeAndValidate(
    workbook,
    originalData.count + 1,
    originalData.records,
  );
}

export async function updateWorkbookRecord(
  buffer: Buffer,
  rowNumber: number,
  input: unknown,
): Promise<Buffer> {
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new WorkbookMutationError("RECORD_NOT_FOUND");
  }

  const values = validateValues(input);
  const originalData = await parseWorkbookBuffer(buffer);
  const targetRecord = originalData.records.find(
    (record) => record.rowNumber === rowNumber,
  );
  if (!targetRecord) {
    throw new WorkbookMutationError("RECORD_NOT_FOUND");
  }

  const workbook = await loadWorkbookBuffer(buffer);
  const worksheet = workbook.getWorksheet("Todos os dados");
  if (!worksheet || rowNumber > worksheet.rowCount) {
    throw new WorkbookMutationError("RECORD_NOT_FOUND");
  }
  const headers = getWorksheetHeaders(worksheet);
  const row = worksheet.getRow(rowNumber);

  for (const [header, value] of Object.entries(values)) {
    const columnIndex = headers.indexOf(header) + 1;
    if (columnIndex < 1) {
      throw new WorkbookMutationError("INVALID_INPUT");
    }
    row.getCell(columnIndex).value = parseValue(header, value ?? null);
  }

  return serializeAndValidate(
    workbook,
    originalData.count,
    originalData.records,
    rowNumber,
  );
}
