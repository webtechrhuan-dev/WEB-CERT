import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/access", () => ({ AccessError: class AccessError extends Error {} }));
vi.mock("@/lib/server/github-workbook", () => ({ GitHubWorkbookError: class GitHubWorkbookError extends Error {} }));
vi.mock("@/lib/server/workbook-mutations", () => ({ WorkbookMutationError: class WorkbookMutationError extends Error {} }));
vi.mock("@/lib/server/workbook", () => ({ WorkbookReadError: class WorkbookReadError extends Error {} }));
vi.mock("@/lib/server/workbook-store", () => ({ WorkbookPersistenceError: class WorkbookPersistenceError extends Error {} }));

import { apiErrorResponse } from "@/lib/server/api-errors";
import { ApiRequestError } from "@/lib/server/request-body";

describe("respostas padronizadas de erros da API", () => {
  it("converte validação de payload de vendas em HTTP 400", async () => {
    const response = apiErrorResponse(new Error("INVALID_INPUT"), "tests");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "Revise os dados informados e tente novamente.",
      },
    });
  });

  it("preserva HTTP 413 para corpos acima do limite", () => {
    const response = apiErrorResponse(
      new ApiRequestError("PAYLOAD_TOO_LARGE", "Requisição muito grande."),
      "tests",
    );
    expect(response.status).toBe(413);
  });

  it("não expõe mensagens internas de erros inesperados", async () => {
    const response = apiErrorResponse(new Error("database password leaked"), "tests");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INTERNAL_ERROR", message: "Ocorreu um erro inesperado. Tente novamente." },
    });
  });
});
