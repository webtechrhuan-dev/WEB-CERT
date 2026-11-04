import { Readable } from "node:stream";
import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { writeAuditEvent } from "@/lib/server/audit-log";
import { getCertificatesBucket, getCertificatesDb, parseObjectId } from "@/lib/server/certificates-mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    const access = await requireAccess();
    const { fileId } = await context.params;
    const id = parseObjectId(fileId);
    if (!id) return Response.json({ error: { code: "INVALID_FILE_ID", message: "Arquivo inválido." } }, { status: 400 });

    const db = await getCertificatesDb();
    const file = await db.collection("certificate_files.files").findOne({ _id: id });
    if (!file) return Response.json({ error: { code: "FILE_NOT_FOUND", message: "Certificado não encontrado." } }, { status: 404 });

    const metadata = (file.metadata ?? {}) as { rowNumber?: number; originalName?: string };
    const rowNumber = metadata.rowNumber;
    if (typeof rowNumber !== "number" || !Number.isSafeInteger(rowNumber)) {
      return Response.json({ error: { code: "INVALID_FILE_METADATA", message: "Metadados do certificado inválidos." } }, { status: 404 });
    }

    const auditRecorded = await writeAuditEvent({ actor: access.login, action: "certificate.downloaded", entity: "certificate", entityId: String(file._id), metadata: { rowNumber } });
    const bucket = await getCertificatesBucket();
    const stream = bucket.openDownloadStream(id);
    const safeName = String(metadata.originalName || file.filename || "certificado.pfx")
      .replace(/[\r\n"]/g, "_");
    const asciiName = safeName.replace(/[^\x20-\x7E]/g, "_");
    const encodedName = encodeURIComponent(safeName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/x-pkcs12",
        "Content-Length": String(file.length),
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Audit-Recorded": auditRecorded ? "true" : "false",
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "api/certificates/[fileId]");
  }
}
