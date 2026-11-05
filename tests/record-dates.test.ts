import { describe, expect, it } from "vitest";
import { expiryFromIssueDate, isValidIsoDate } from "../lib/record-dates";

describe("datas de emissão e vencimento", () => {
  it.each([
    ["2026-11-05", true],
    ["2024-02-29", true],
    ["2026-02-29", false],
    ["2026-02-31", false],
    ["2026-13-01", false],
    ["05/11/2026", false],
    ["", false],
  ] as Array<[string, boolean]>)("valida %s", (value, valid) => {
    expect(isValidIsoDate(value)).toBe(valid);
  });

  it("calcula vencimento um ano após a emissão", () => {
    expect(expiryFromIssueDate("2026-11-05")).toBe("2027-11-05");
  });

  it("ajusta 29 de fevereiro para o último dia válido do ano seguinte", () => {
    expect(expiryFromIssueDate("2024-02-29")).toBe("2025-02-28");
  });

  it("não cria vencimento falso para datas legadas impossíveis", () => {
    expect(expiryFromIssueDate("2026-02-31")).toBeNull();
  });
});
