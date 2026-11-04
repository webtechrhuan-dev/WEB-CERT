import { describe, expect, it } from "vitest";
import { validateRecordInput } from "../lib/server/record-validation";

const valid = { "Ano da planilha": "2026", "Mês da planilha": "novembro", Cliente: "Cliente de teste", "Data de emissão/renovação": "2026-11-04", Modelo: "CNPJ - A1", "Status / Observação": "Emitido" };

describe("validação de vendas no servidor", () => {
  it("aceita os campos essenciais e valores monetários brasileiros válidos", () => {
    expect(validateRecordInput({ ...valid, "Faturamento (R$)": "R$ 1.234,56", "Custo (R$)": "234,56" }, true).Cliente).toBe("Cliente de teste");
  });
  it.each(["2026-02-29", "2026-02-31", "04/11/2026", "2026-13-01"])("rejeita data inválida ou fora do padrão ISO: %s", (date) => {
    expect(() => validateRecordInput({ ...valid, "Data de emissão/renovação": date }, true)).toThrow("INVALID_INPUT");
  });
  it.each(["A1", "CPF-A3", "CNPJ - A3"])("rejeita modelo não permitido: %s", (model) => {
    expect(() => validateRecordInput({ ...valid, Modelo: model }, true)).toThrow("INVALID_INPUT");
  });
  it.each(["Em análise", "Pago", "Concluído"])("rejeita status fora da lista: %s", (status) => {
    expect(() => validateRecordInput({ ...valid, "Status / Observação": status }, true)).toThrow("INVALID_INPUT");
  });
  it.each(["-20,00", "12,345", "1.2.3", "abc"])("rejeita valor monetário inválido: %s", (value) => {
    expect(() => validateRecordInput({ ...valid, "Faturamento (R$)": value }, true)).toThrow("INVALID_INPUT");
  });
  it("exige os campos essenciais no cadastro, mas permite atualizações parciais", () => {
    expect(() => validateRecordInput({ Cliente: " " }, true)).toThrow("INVALID_INPUT");
    expect(validateRecordInput({ Cliente: "Nome atualizado" })).toEqual({ Cliente: "Nome atualizado" });
  });
});
