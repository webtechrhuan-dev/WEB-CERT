import "server-only";
import { ObjectId } from "mongodb";
import { getMongoDb } from "./mongodb";
import type { WorkbookCell, WorkbookData, WorkbookRecord } from "@/lib/workbook-types";

const collection = "certificates";
const HEADERS = ["Ano da planilha","Mês da planilha","Cliente","Contato","Data de emissão/renovação","Data de vencimento","Modelo","Faturamento (R$)","Custo (R$)","Status / Observação"];

function expiryFromIssueDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const expiryYear = year + 1;
  const lastDay = new Date(Date.UTC(expiryYear, month, 0)).getUTCDate();
  return [expiryYear, String(month).padStart(2, "0"), String(Math.min(day, lastDay)).padStart(2, "0")].join("-");
}
function normalizeValues(input: WorkbookCell[]): WorkbookCell[] {
  const values = [...input];
  if (values.length === HEADERS.length - 1) values.splice(5, 0, null);
  values[5] = expiryFromIssueDate(values[4]);
  return values;
}
const projection = { _id: 1, rowNumber: 1, values: 1, createdAt: 1, updatedAt: 1 };

export async function readCertificateData(): Promise<WorkbookData> {
  const db = await getMongoDb();
  const rows = await db.collection(collection).find({}, { projection }).sort({ rowNumber: 1 }).toArray();
  const records: WorkbookRecord[] = rows.map((row) => ({ rowNumber: row.rowNumber, values: normalizeValues(row.values as WorkbookCell[]) }));
  return { headers: HEADERS, count: records.length, records, source: "mongodb", version: new Date().toISOString() };
}

export async function createCertificate(values: WorkbookCell[]): Promise<void> {
  const db = await getMongoDb();
  values = normalizeValues(values);
  const last = await db.collection(collection).findOne({}, { sort: { rowNumber: -1 }, projection: { rowNumber: 1 } });
  const now = new Date();
  await db.collection(collection).insertOne({ rowNumber: (last?.rowNumber ?? 1) + 1, values, createdAt: now, updatedAt: now });
}

export async function updateCertificate(rowNumber: number, values: WorkbookCell[], expectedVersion?: string): Promise<boolean> {
  const db = await getMongoDb();
  values = normalizeValues(values);
  const result = await db.collection(collection).findOneAndUpdate({ rowNumber }, { $set: { values, updatedAt: new Date() } }, { returnDocument: "after", projection });
  return Boolean(result);
}

export async function importCertificates(records: WorkbookRecord[]): Promise<number> {
  const db = await getMongoDb();
  const now = new Date();
  const operations = records.map((record) => ({ updateOne: { filter: { rowNumber: record.rowNumber }, update: { $set: { values: record.values, updatedAt: now }, $setOnInsert: { rowNumber: record.rowNumber, createdAt: now } }, upsert: true } }));
  if (operations.length) await db.collection(collection).bulkWrite(operations);
  await db.collection(collection).createIndex({ rowNumber: 1 }, { unique: true });
  return operations.length;
}
