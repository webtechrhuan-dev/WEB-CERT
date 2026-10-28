import ExcelJS from "exceljs";
import { MongoClient } from "mongodb";
import path from "node:path";
const uri = process.env.MONGODB_URI; if (!uri) throw new Error("MONGODB_URI não configurada.");
const file = process.env.EXCEL_FILE_PATH ?? path.resolve("CERTIFICADOS_UNIFICADOS_2024-2026.xlsx");
const client = await new MongoClient(uri).connect(); try {
 const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file); const sheet = workbook.getWorksheet("Todos os dados"); if (!sheet) throw new Error("Aba Todos os dados não encontrada.");
 const headers = sheet.getRow(1).values.slice(1) as string[]; const rows = [];
 for (let n=2;n<=sheet.rowCount;n++){ const values=sheet.getRow(n).values.slice(1); if (values.some(v=>v!==null&&v!==undefined&&v!=="")) rows.push({rowNumber:n,values}); }
 const db=client.db(process.env.MONGODB_DB ?? "web_cert"); const now=new Date(); await db.collection("certificates").createIndex({rowNumber:1},{unique:true}); for (const row of rows) await db.collection("certificates").updateOne({rowNumber:row.rowNumber},{$set:{values:row.values,updatedAt:now},$setOnInsert:{rowNumber:row.rowNumber,createdAt:now}},{upsert:true}); console.log(JSON.stringify({headers,count:rows.length})); } finally { await client.close(); }
