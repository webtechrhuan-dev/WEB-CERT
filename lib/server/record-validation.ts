import { WORKBOOK_HEADERS, type WorkbookCell } from "@/lib/workbook-types";
export function validateRecordInput(input: unknown): Record<string, string | null> {
 if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_INPUT");
 const out: Record<string,string|null> = {};
 for (const [key,value] of Object.entries(input as Record<string,unknown>)) {
  if (!(WORKBOOK_HEADERS as readonly string[]).includes(key) || (value !== null && typeof value !== "string") || (typeof value === "string" && value.length > 32767)) throw new Error("INVALID_INPUT");
  out[key]=value as string|null;
 }
 if (!Object.keys(out).length) throw new Error("INVALID_INPUT"); return out;
}
export function valuesFromInput(input: Record<string,string|null>): WorkbookCell[] { return WORKBOOK_HEADERS.map((h) => input[h] ?? null); }
