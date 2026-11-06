import { decryptCertificatePassword } from "@/lib/server/certificate-password";
import { requireAccess } from "@/lib/server/access";
import { verifyReauthentication } from "@/auth";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { readJsonBody } from "@/lib/server/request-body";
import { getCertificatesDb, ensureCertificateStoreIndexes, parseObjectId } from "@/lib/server/certificates-mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store, private", "Pragma": "no-cache" },
  });
}

/** Reveals a PFX password only after explicit reauthentication by its owner. */
export async function POST(request: Request, context: { params: Promise<{ rowNumber: string; fileId: string }> }) {
  try {
    const access = await requireAccess("editor");
    const { rowNumber: rawRowNumber, fileId } = await context.params;
    const rowNumber = Number(rawRowNumber);
    const id = parseObjectId(fileId);
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 2 || !id) {
      return jsonError("INVALID_CERTIFICATE", "Venda ou certificado inválido.", 400);
    }

    const body = await readJsonBody(request);
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!username || username !== access.login.toLowerCase() || !password ||
        !(await verifyReauthentication(username, password))) {
      return jsonError("REAUTHENTICATION_FAILED", "Usuário ou senha incorretos. A senha do certificado não foi exibida.", 401);
    }

    await ensureCertificateStoreIndexes();
    const db = await getCertificatesDb();
    const file = await db.collection("certificate_files.files").findOne(
      { _id: id, "metadata.rowNumber": rowNumber },
      { projection: { _id: 1, metadata: 1 } },
    );
    if (!file) return jsonError("FILE_NOT_FOUND", "Certificado não encontrado nesta venda.", 404);

    const metadata = file.metadata as {
      expiresAt?: Date | string;
      passwordEncrypted?: { algorithm: string; iv: string; authTag: string; ciphertext: string };
    } | undefined;
    if (!metadata?.passwordEncrypted) {
      return jsonError("CERTIFICATE_PASSWORD_UNAVAILABLE", "Este certificado não possui uma senha armazenada para consulta.", 409);
    }
    const expiresAt = metadata.expiresAt ? new Date(metadata.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
      return jsonError("CERTIFICATE_EXPIRED", "A senha não pode ser exibida porque o certificado já venceu.", 410);
    }

    const certificatePassword = decryptCertificatePassword(metadata.passwordEncrypted);
    return Response.json({ password: certificatePassword }, {
      headers: {
        "Cache-Control": "no-store, private, max-age=0",
        "Pragma": "no-cache",
        "Vary": "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "api/records/[rowNumber]/certificates/[fileId]/password");
  }
}
