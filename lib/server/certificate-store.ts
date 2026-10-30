import "server-only";
import { getMongoDb } from "./mongodb";
import type { WorkbookCell, WorkbookData, WorkbookRecord } from "@/lib/workbook-types";

const collection = "certificates";
const counters = "counters";
const counterId = "certificate-row-number";
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

async function ensureStorageIndexes(): Promise<void> {
  const db = await getMongoDb();
  // A restrição única impede que duas requisições gravem a mesma linha.
  await db.collection(collection).createIndex({ rowNumber: 1 }, { unique: true });
}

async function nextRowNumber(): Promise<number> {
  const db = await getMongoDb();
  const rows = db.collection(collection);
  // Inicialização idempotente: concorrentes disputam o mesmo upsert; somente
  // uma inserção inicializa o contador e todos incrementam atomicamente depois.
  const highest = await rows.findOne({}, { sort: { rowNumber: -1 }, projection: { rowNumber: 1 } });
  await db.collection(counters).updateOne(
    { _id: counterId },
    { $setOnInsert: { value: Math.max(1, Number(highest?.rowNumber) || 1) } },
    { upsert: true },
  );
  const result = await db.collection(counters).findOneAndUpdate(
    { _id: counterId },
    { $inc: { value: 1 } },
    { returnDocument: "after" },
  );
  if (!result || !Number.isSafeInteger(result.value)) throw new Error("COUNTER_ALLOCATION_FAILED");
  return result.value;
}

export async function readCertificateData(): Promise<WorkbookData> {
  const db = await getMongoDb();
  await ensureStorageIndexes();
  const rows = await db.collection(collection).find({}, { projection }).sort({ rowNumber: 1 }).toArray();
  const records: WorkbookRecord[] = rows.map((row) => ({ rowNumber: row.rowNumber, values: normalizeValues(row.values as WorkbookCell[]) }));
  return { headers: HEADERS, count: records.length, records, source: "mongodb", version: new Date().toISOString() };
}

export async function createCertificate(values: WorkbookCell[]): Promise<void> {
  const db = await getMongoDb();
  await ensureStorageIndexes();
  const rowNumber = await nextRowNumber();
  const now = new Date();
  await db.collection(collection).insertOne({ rowNumber, values: normalizeValues(values), createdAt: now, updatedAt: now });
}

export async function updateCertificate(rowNumber: number, values: WorkbookCell[], _expectedVersion?: string): Promise<boolean> {
  const db = await getMongoDb();
  await ensureStorageIndexes();
  values = normalizeValues(values);
  const result = await db.collection(collection).findOneAndUpdate(
    { rowNumber },
    { $set: { values, updatedAt: new Date() } },
    { returnDocument: "after", projection },
  );
  return Boolean(result);
}

export async function importCertificates(records: WorkbookRecord[]): Promise<number> {
  const db = await getMongoDb();
  const now = new Date();
  const operations = records.map((record) => ({ updateOne: { filter: { rowNumber: record.rowNumber }, update: { $set: { values: normalizeValues(record.values), updatedAt: now }, $setOnInsert: { rowNumber: record.rowNumber, createdAt: now } }, upsert: true } }));
  if (operations.length) await db.collection(collection).bulkWrite(operations);
  await ensureStorageIndexes();
  const highest = records.reduce((max, record) => Math.max(max, record.rowNumber), 1);
  await db.collection(counters).updateOne({ _id: counterId }, { $max: { value: highest } }, { upsert: true });
  return operations.length;
}
