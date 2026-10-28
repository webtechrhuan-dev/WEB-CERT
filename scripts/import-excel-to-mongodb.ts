import ExcelJS from "exceljs";
import { MongoClient } from "mongodb";
import path from "node:path";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI não configurada.");

const file =
  process.env.EXCEL_FILE_PATH ??
  path.resolve("CERTIFICADOS_UNIFICADOS_2024-2026.xlsx");

const client = new MongoClient(uri);

try {
  await client.connect();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);

  const sheet = workbook.getWorksheet("Todos os dados");
  if (!sheet) throw new Error("Aba Todos os dados não encontrada.");

  // A propriedade Row.values do ExcelJS é uma união de tipos e pode incluir
  // valores não indexáveis. Ler cada célula explicitamente evita essa ambiguidade.
  const columnCount = sheet.columnCount;
  const headers: string[] = Array.from({ length: columnCount }, (_, index) =>
    sheet.getCell(1, index + 1).text,
  );

  const rows: Array<{ rowNumber: number; values: unknown[] }> = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const values: unknown[] = Array.from(
      { length: columnCount },
      (_, index) => sheet.getCell(rowNumber, index + 1).value ?? null,
    );

    if (values.some((value) => value !== null && value !== "")) {
      rows.push({ rowNumber, values });
    }
  }

  const db = client.db(process.env.MONGODB_DB ?? "web_cert");
  const collection = db.collection("certificates");
  const now = new Date();

  await collection.createIndex({ rowNumber: 1 }, { unique: true });

  for (const row of rows) {
    await collection.updateOne(
      { rowNumber: row.rowNumber },
      {
        $set: { values: row.values, updatedAt: now },
        $setOnInsert: { rowNumber: row.rowNumber, createdAt: now },
      },
      { upsert: true },
    );
  }

  console.log(JSON.stringify({ headers, count: rows.length }));
} finally {
  await client.close();
}
