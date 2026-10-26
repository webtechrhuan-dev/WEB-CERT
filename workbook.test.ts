import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import {
  parseWorkbookBuffer,
  readWorkbookBufferFromPath,
  readWorkbookFromPath,
  WORKBOOK_HEADERS,
  WorkbookReadError,
} from "../lib/server/workbook";
import { createWorkbookGetHandler } from "../lib/server/workbook-api";
import {
  createWorkbookRecord,
  updateWorkbookRecord,
  WorkbookMutationError,
} from "../lib/server/workbook-mutations";

async function createWorkbook(
  headers: readonly string[] = WORKBOOK_HEADERS,
  rows: Array<Array<string | number | boolean | Date | null | undefined>> = [],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Todos os dados");
  worksheet.addRow([...headers]);
  rows.forEach((row) => worksheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("leitura da planilha", () => {
  it("lê a planilha real disponível localmente e preserva seus cabeçalhos e contagem", async () => {
    const data = await readWorkbookFromPath();

    expect(data.headers).toEqual(WORKBOOK_HEADERS);
    expect(data.count).toBe(170);
  });

  it("lê registros de um workbook válido", async () => {
    const buffer = await createWorkbook(WORKBOOK_HEADERS, [
      [2025, "Março", "Cliente teste", null, new Date(Date.UTC(2025, 2, 4)), "A1", 100, 25, null],
    ]);

    const data = await parseWorkbookBuffer(buffer);

    expect(data.count).toBe(1);
    expect(data.headers).toEqual(WORKBOOK_HEADERS);
    expect(data.records[0].values[2]).toBe("Cliente teste");
  });

  it("retorna erro seguro quando o arquivo não existe", async () => {
    await expect(
      readWorkbookFromPath("C:\\caminho-inexistente\\arquivo.xlsx"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejeita cabeçalhos ausentes", async () => {
    const buffer = await createWorkbook(WORKBOOK_HEADERS.slice(0, -1));

    await expect(parseWorkbookBuffer(buffer)).rejects.toMatchObject({
      code: "INVALID_STRUCTURE",
    });
  });

  it("rejeita cabeçalhos desconhecidos", async () => {
    const headers: string[] = [...WORKBOOK_HEADERS];
    headers[2] = "Campo não reconhecido";

    await expect(parseWorkbookBuffer(await createWorkbook(headers))).rejects.toMatchObject({
      code: "INVALID_STRUCTURE",
    });
  });

  it("preserva células vazias como null e ignora linhas sem dados", async () => {
    const buffer = await createWorkbook(WORKBOOK_HEADERS, [
      [2025, "Março", null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null],
    ]);

    const data = await parseWorkbookBuffer(buffer);

    expect(data.count).toBe(1);
    expect(data.records[0].values[2]).toBeNull();
    expect(data.records[0].values[4]).toBeNull();
  });

  it("distingue datas Excel, datas textuais válidas e texto que não representa uma data válida", async () => {
    const buffer = await createWorkbook(WORKBOOK_HEADERS, [
      [2025, "Março", null, null, new Date(Date.UTC(2025, 2, 4)), null, null, null, null],
      [2025, "Março", null, null, "4/3/2025", null, null, null, null],
      [2025, "Março", null, null, "31/2/2025", null, null, null, null],
      [2025, "Março", null, null, "texto não reconhecido", null, null, null, null],
    ]);

    const data = await parseWorkbookBuffer(buffer);

    expect(data.records[0].values[4]).toMatchObject({
      kind: "date",
      source: "excel",
      parsed: "2025-03-04",
    });
    expect(data.records[1].values[4]).toMatchObject({
      kind: "date",
      source: "text",
      raw: "4/3/2025",
      parsed: "2025-03-04",
    });
    expect(data.records[2].values[4]).toMatchObject({
      kind: "date",
      source: "text",
      raw: "31/2/2025",
      parsed: null,
    });
    expect(data.records[3].values[4]).toMatchObject({
      kind: "date",
      source: "text",
      raw: "texto não reconhecido",
      parsed: null,
    });
  });

  it("rejeita arquivos Excel inválidos", async () => {
    await expect(parseWorkbookBuffer(Buffer.from("arquivo inválido"))).rejects.toMatchObject({
      code: "INVALID_WORKBOOK",
    });
  });
});

describe("API de consulta", () => {
  it("retorna os registros e impede cache da resposta", async () => {
    const data = {
      headers: [...WORKBOOK_HEADERS],
      count: 0,
      records: [],
    };
    const handler = createWorkbookGetHandler(async () => data);

    const response = await handler();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(data);
  });

  it("retorna erro compreensível sem incluir o caminho local", async () => {
    const handler = createWorkbookGetHandler(async () => {
      throw new WorkbookReadError("NOT_FOUND");
    });

    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.message).toContain("não foi encontrada");
    expect(JSON.stringify(body)).not.toContain("C:\\");
  });

  it("não expõe detalhes inesperados da falha", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = createWorkbookGetHandler(async () => {
      throw new Error("detalhe interno com caminho C:\\privado\\planilha.xlsx");
    });

    try {
      const response = await handler();
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(JSON.stringify(body)).not.toContain("C:\\");
      expect(JSON.stringify(body)).not.toContain("detalhe interno");
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });
});

describe("alterações em memória", () => {
  it("cadastra uma linha preservando o histórico, cabeçalhos e referência da tabela", async () => {
    const original = await readWorkbookBufferFromPath();
    const originalData = await parseWorkbookBuffer(original);
    const output = await createWorkbookRecord(original, {
      "Ano da planilha": "2026",
      "Mês da planilha": "Teste",
      Cliente: "Registro sintético de teste",
      Contato: null,
      "Data de emissão/renovação": "2026-10-26",
      Modelo: "Teste",
      "Faturamento (R$)": "1.234,56",
      "Custo (R$)": "45,00",
      "Status / Observação": null,
    });
    const data = await parseWorkbookBuffer(output);
    const archive = await JSZip.loadAsync(output);
    const tableFileName = Object.keys(archive.files).find((fileName) =>
      /^xl\/tables\/table\d+\.xml$/.test(fileName),
    );
    const tableXml = tableFileName
      ? await archive.file(tableFileName)?.async("string")
      : undefined;

    expect(data.count).toBe(originalData.count + 1);
    expect(data.records.slice(0, originalData.count)).toEqual(originalData.records);
    expect(data.records.at(-1)?.values[6]).toBe(1234.56);
    expect(data.records.at(-1)?.values[7]).toBe(45);
    expect(tableXml).toContain(`ref="A1:I${data.count + 1}"`);
  });

  it("edita somente os campos alterados e preserva as demais linhas", async () => {
    const original = await readWorkbookBufferFromPath();
    const originalData = await parseWorkbookBuffer(original);
    const target = originalData.records[0];
    const updated = await updateWorkbookRecord(original, target.rowNumber, {
      "Status / Observação": "Alteração sintética de teste",
    });
    const updatedData = await parseWorkbookBuffer(updated);
    const updatedTarget = updatedData.records.find(
      (record) => record.rowNumber === target.rowNumber,
    );

    expect(updatedData.count).toBe(originalData.count);
    expect(updatedData.records.filter((record) => record.rowNumber !== target.rowNumber))
      .toEqual(originalData.records.filter((record) => record.rowNumber !== target.rowNumber));
    expect(updatedTarget?.values[8]).toBe("Alteração sintética de teste");
    expect(updatedTarget?.values.slice(0, 8)).toEqual(target.values.slice(0, 8));
  });

  it("permite limpar um campo sem remover a linha", async () => {
    const original = await readWorkbookBufferFromPath();
    const originalData = await parseWorkbookBuffer(original);
    const target = originalData.records[0];
    const columnIndex = target.values.findIndex((value) => value !== null);
    const header = originalData.headers[columnIndex];
    const updated = await updateWorkbookRecord(original, target.rowNumber, {
      [header]: null,
    });
    const updatedData = await parseWorkbookBuffer(updated);
    const updatedTarget = updatedData.records.find(
      (record) => record.rowNumber === target.rowNumber,
    );

    expect(updatedData.count).toBe(originalData.count);
    expect(updatedTarget?.values[columnIndex]).toBeNull();
  });

  it("rejeita datas inválidas sem modificar a fonte", async () => {
    const original = await readWorkbookBufferFromPath();

    await expect(
      createWorkbookRecord(original, {
        Cliente: "Registro sintético",
        "Data de emissão/renovação": "31/02/2026",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
    } satisfies Partial<WorkbookMutationError>);
  });
});
