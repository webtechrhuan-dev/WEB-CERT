export class ApiRequestError extends Error {
  constructor(public readonly code: "PAYLOAD_TOO_LARGE" | "MALFORMED_JSON", message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Lê o corpo em streaming e limita os bytes efetivamente recebidos (não confia em Content-Length). */
export async function readJsonBody(request: Request, maxBytes = 512_000): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiRequestError("PAYLOAD_TOO_LARGE", "Requisição muito grande.");
  }
  if (!request.body) throw new ApiRequestError("MALFORMED_JSON", "O corpo JSON da requisição está ausente ou inválido.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ApiRequestError("PAYLOAD_TOO_LARGE", "Requisição muito grande.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiRequestError("MALFORMED_JSON", "O corpo JSON da requisição está ausente ou inválido.");
  }
}
