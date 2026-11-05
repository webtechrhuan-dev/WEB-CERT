export class ApiRequestError extends Error {
  constructor(public readonly code: "PAYLOAD_TOO_LARGE" | "MALFORMED_JSON", message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Lê bytes em streaming e limita o total efetivamente recebido. */
export async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const rawLength = request.headers.get("content-length");
  const declaredLength = rawLength === null ? Number.NaN : Number(rawLength);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiRequestError("PAYLOAD_TOO_LARGE", "Requisição muito grande.");
  }
  if (!request.body) return new Uint8Array();

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
  return bytes;
}

/** JSON de API precisa ser um objeto; arrays, null e escalares são recusados. */
export async function readJsonBody(request: Request, maxBytes = 512_000): Promise<Record<string, unknown>> {
  const bytes = await readBodyBytes(request, maxBytes);
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON body must be an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiRequestError("MALFORMED_JSON", "O corpo JSON da requisição está ausente ou inválido.");
  }
}
