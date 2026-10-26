import type { WorkbookApiError, WorkbookData } from "../workbook-types";
import { WorkbookReadError } from "./workbook";

type WorkbookReader = () => Promise<WorkbookData>;

const publicErrors: Record<
  WorkbookReadError["code"],
  { status: number; message: string }
> = {
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
};

export function createWorkbookGetHandler(
  readWorkbook: WorkbookReader,
): () => Promise<Response> {
  return async () => {
    try {
      const data = await readWorkbook();
      return Response.json(data, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof WorkbookReadError) {
        const publicError = publicErrors[error.code];
        const body: WorkbookApiError = {
          error: { code: error.code, message: publicError.message },
        };

        return Response.json(body, {
          status: publicError.status,
          headers: { "Cache-Control": "no-store" },
        });
      }

      console.error("[api/records] Unexpected workbook read failure");
      const body: WorkbookApiError = {
        error: {
          code: "INTERNAL_ERROR",
          message: "Ocorreu um erro inesperado ao carregar a planilha.",
        },
      };
      return Response.json(body, {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      });
    }
  };
}
