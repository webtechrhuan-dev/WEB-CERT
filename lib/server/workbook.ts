import "server-only";

import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  WorkbookCell,
  WorkbookData,
  WorkbookDateCell,
} from "../workbook-types";
import { WORKBOOK_HEADERS } from "../workbook-types";

export { WORKBOOK_HEADERS } from "../workbook-types";

const DATE_HEADER = "Data de emissão/renovação";

export type WorkbookReadErrorCode =
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "READ_FAILED"
  | "INVALID_WORKBOOK"
  | "INVALID_STRUCTURE";

export class WorkbookReadError extends Error {
  constructor(public readonly code: WorkbookReadErrorCode) {
    super("Não foi possível ler a planilha.");
    this.name = "WorkbookReadError";
  }
}

function toIsoDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function parseTextDate(value: string): string | null {
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  const brMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  const match = isoMatch ?? brMatch;

  if (!match) {
    return null;
  }

  const year = Number(match[isoMatch ? 1 : 3]);
  const month = Number(match[2]);
  const day = Number(match[isoMatch ? 3 : 1]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return toIsoDate(date);
}

function dateCell(
  value: unknown,
  source: WorkbookDateCell["source"],
): WorkbookDateCell {
  if (value instanceof Date) {
    const parsed = toIsoDate(value);
    return {
      kind: "date",
      source: parsed ? "excel" : "invalid",
      raw: parsed ?? value.toString(),
      parsed,
    };
  }

  if (typeof value === "string") {
    return {
      kind: "date",
      source: source === "invalid" ? "invalid" : "text",
      raw: value,
      parsed: parseTextDate(value),
    };
  }

  if (typeof value === "number") {
    return { kind: "date", source: "invalid", raw: value, parsed: null };
  }

  return { kind: "date", source: "invalid", raw: "", parsed: null };
}

function normalizeCell(value: unknown, header: string): WorkbookCell {
  if (value === null || value === undefined) {
    return null;
  }

  if (header === DATE_HEADER) {
    return dateCell(value, "text");
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return toIsoDate(value) ?? value.toString();
  }

  if (typeof value === "object") {
    if ("result" in value) {
      return normalizeCell(value.result, header);
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text).join("");
    }

    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }

    if ("error" in value && typeof value.error === "string") {
      return value.error;
    }
  }

  throw new WorkbookReadError("INVALID_WORKBOOK");
}

function getHeaders(worksheet: ExcelJS.Worksheet): string[] {
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];

  for (let column = 1; column <= headerRow.cellCount; column += 1) {
    const value = headerRow.getCell(column).value;
    if (typeof value !== "string" || value.length === 0) {
      throw new WorkbookReadError("INVALID_STRUCTURE");
    }
    headers.push(value);
  }

  const expected = new Set<string>(WORKBOOK_HEADERS);
  if (
    headers.length !== expected.size ||
    new Set(headers).size !== headers.length ||
    headers.some((header) => !expected.has(header))
  ) {
    throw new WorkbookReadError("INVALID_STRUCTURE");
  }

  return headers;
}

export async function loadWorkbookBuffer(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();

  try {
    const archive = await JSZip.loadAsync(buffer);
    let normalizedRelationship = false;

    for (const fileName of Object.keys(archive.files)) {
      if (!/^xl\/worksheets\/_rels\/[^/]+\.rels$/.test(fileName)) {
        continue;
      }
      const file = archive.file(fileName);
      if (!file) {
        continue;
      }

      const relationships = await file.async("string");
      const normalized = relationships.replace(
        /(<Relationship\b(?=[^>]*\bType="[^"]*\/table")[^>]*\bTarget=")\/xl\/tables\//g,
        "$1../tables/",
      );
      if (normalized !== relationships) {
        archive.file(fileName, normalized);
        normalizedRelationship = true;
      }
    }

    const xlsxBytes = normalizedRelationship
      ? await archive.generateAsync({ type: "uint8array" })
      : new Uint8Array(buffer);
    const xlsxBuffer = new Uint8Array(xlsxBytes.byteLength);
    xlsxBuffer.set(xlsxBytes);
    await workbook.xlsx.load(xlsxBuffer.buffer);
  } catch {
    throw new WorkbookReadError("INVALID_WORKBOOK");
  }

  return workbook;
}

export function getWorksheetHeaders(worksheet: ExcelJS.Worksheet): string[] {
  return getHeaders(worksheet);
}

export async function parseWorkbookBuffer(buffer: Buffer): Promise<WorkbookData> {
  const workbook = await loadWorkbookBuffer(buffer);
  const worksheet = workbook.getWorksheet("Todos os dados");
  if (!worksheet) {
    throw new WorkbookReadError("INVALID_STRUCTURE");
  }

  const headers = getHeaders(worksheet);
  const records: WorkbookData["records"] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = headers.map((header, index) =>
      normalizeCell(row.getCell(index + 1).value, header),
    );

    if (values.some((value) => value !== null && value !== "")) {
      records.push({ rowNumber, values });
    }
  }

  return { headers, count: records.length, records };
}

export function getWorkbookPath(): string {
  const configuredPath = process.env.EXCEL_FILE_PATH;
  return configuredPath
    ? path.resolve(configuredPath)
    : path.join(process.cwd(), "CERTIFICADOS_UNIFICADOS_2024-2026.xlsx");
}

export async function readWorkbookBufferFromPath(
  filePath = getWorkbookPath(),
): Promise<Buffer> {
  let buffer: Buffer;

  try {
    buffer = await readFile(filePath);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;

    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new WorkbookReadError("NOT_FOUND");
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new WorkbookReadError("ACCESS_DENIED");
    }
    throw new WorkbookReadError("READ_FAILED");
  }

  return buffer;
}

export async function readWorkbookFromPath(
  filePath = getWorkbookPath(),
): Promise<WorkbookData> {
  const buffer = await readWorkbookBufferFromPath(filePath);
  return parseWorkbookBuffer(buffer);
}
