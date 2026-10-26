import "server-only";

import { AccessError } from "@/lib/server/access";
import { GitHubWorkbookError } from "@/lib/server/github-workbook";
import { WorkbookMutationError } from "@/lib/server/workbook-mutations";
import { WorkbookReadError } from "@/lib/server/workbook";
import { WorkbookPersistenceError } from "@/lib/server/workbook-store";

const accessMessages = {
  AUTH_NOT_CONFIGURED: {
    status: 503,
    message: "A autenticação corporativa ainda não está configurada.",
  },
  UNAUTHENTICATED: {
    status: 401,
    message: "Entre com sua conta corporativa para acessar os dados.",
  },
  FORBIDDEN: {
    status: 403,
    message: "Sua conta não tem permissão para alterar a planilha.",
  },
} as const;

const workbookMessages = {
  NOT_FOUND: {
    status: 404,
    message: "A planilha não foi encontrada no ambiente de leitura.",
  },
  ACCESS_DENIED: {
    status: 503,
    message: "O servidor não tem acesso à planilha configurada.",
  },
  READ_FAILED: {
    status: 500,
    message: "O servidor não conseguiu acessar a planilha.",
  },
  INVALID_WORKBOOK: {
    status: 422,
    message: "O arquivo não é uma planilha Excel válida ou não pôde ser interpretado.",
  },
  INVALID_STRUCTURE: {
    status: 422,
    message: "A planilha não contém a aba ou os cabeçalhos esperados.",
  },
} as const;

const githubMessages = {
  NOT_CONFIGURED: {
    status: 503,
    message: "A integração de persistência GitHub não está configurada.",
  },
  NOT_FOUND: {
    status: 404,
    message: "A versão ou o arquivo configurado não foi encontrado no GitHub.",
  },
  CONFLICT: {
    status: 409,
    message: "A planilha mudou desde a leitura. Atualize os dados e tente novamente.",
  },
  ACCESS_DENIED: {
    status: 503,
    message: "O servidor não tem permissão para acessar o repositório configurado.",
  },
  UNAVAILABLE: {
    status: 503,
    message: "O GitHub está indisponível no momento. Tente novamente.",
  },
  INVALID_RESPONSE: {
    status: 422,
    message: "O conteúdo recebido do GitHub não pôde ser validado.",
  },
} as const;

const mutationMessages = {
  INVALID_INPUT: {
    status: 400,
    message: "Revise os campos enviados. Ano, data e valores monetários devem ser válidos.",
  },
  RECORD_NOT_FOUND: {
    status: 404,
    message: "O registro não foi encontrado na versão atual da planilha.",
  },
  INVALID_WORKBOOK: {
    status: 422,
    message: "A alteração não preservou a estrutura íntegra da planilha.",
  },
} as const;

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function apiErrorResponse(error: unknown, route: string): Response {
  if (error instanceof AccessError) {
    const details = accessMessages[error.code];
    return errorResponse(error.code, details.message, details.status);
  }
  if (error instanceof GitHubWorkbookError) {
    const details = githubMessages[error.code];
    return errorResponse(error.code, details.message, details.status);
  }
  if (error instanceof WorkbookReadError) {
    const details = workbookMessages[error.code];
    return errorResponse(error.code, details.message, details.status);
  }
  if (error instanceof WorkbookMutationError) {
    const details = mutationMessages[error.code];
    return errorResponse(error.code, details.message, details.status);
  }
  if (error instanceof WorkbookPersistenceError) {
    return errorResponse(
      error.code,
      "Configure a integração GitHub no ambiente do servidor para usar a planilha.",
      503,
    );
  }

  console.error(`[${route}] Falha inesperada`);
  return errorResponse(
    "INTERNAL_ERROR",
    "Ocorreu um erro inesperado. Tente novamente.",
    500,
  );
}
