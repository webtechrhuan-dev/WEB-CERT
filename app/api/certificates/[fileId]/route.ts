import { randomUUID } from "node:crypto";
import { sanitizeCertificateFileName, toAsciiCertificateFileName } from "@/lib/certificate-file-name";
import { buildAcquireDownloadLeasePipeline, buildReleaseDownloadLeasePipeline } from "@/lib/server/certificate-download-leases";
import { Readable } from "node:stream";
import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { writeAuditEvent } from "@/lib/server/audit-log";
import { getMongoDb } from "@/lib/server/mongodb";
import { getCertificatesBucket, getCertificatesDb, ensureCertificateStoreIndexes, parseObjectId } from "@/lib/server/certificates-mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    const access = await requireAccess();
    const { fileId } = await context.params;
    const id = parseObjectId(fileId);
    if (!id) return Response.json({ error: { code: "INVALID_FILE_ID", message: "Arquivo inválido." } }, { status: 400 });

    await ensureCertificateStoreIndexes();
    const db = await getCertificatesDb();
    const file = await db.collection("certificate_files.files").findOne({ _id: id });
    if (!file) return Response.json({ error: { code: "FILE_NOT_FOUND", message: "Certificado não encontrado." } }, { status: 404 });

    const metadata = (file.metadata ?? {}) as { rowNumber?: number; originalName?: string };
    const rowNumber = metadata.rowNumber;
    if (typeof rowNumber !== "number" || !Number.isSafeInteger(rowNumber) || rowNumber < 2) {
      return Response.json({ error: { code: "INVALID_FILE_METADATA", message: "Metadados do certificado inválidos." } }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    // O ID do GridFS não basta para autorizar o download: o vínculo com a venda
    // precisa continuar válido na base comercial.
    const salesDb = await getMongoDb();
    const sale = await salesDb.collection("certificates").findOne(
      { rowNumber },
      { projection: { _id: 1 } },
    );
    if (!sale) {
      return Response.json({ error: { code: "SALE_NOT_FOUND", message: "A venda vinculada não existe mais. O arquivo não pode ser baixado." } }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    // Cada download possui um lease próprio. Isso evita que a expiração de
    // um download antigo libere indevidamente outro download ainda ativo.
    const leaseToken = randomUUID();
    const now = new Date();
    const lease = await db.collection("certificate_files.files").updateOne(
      {
        _id: id,
        $or: [
          { deleting: { $ne: true } },
          { deletingLeaseExpiresAt: { $lte: now } },
        ],
      },
      buildAcquireDownloadLeasePipeline(leaseToken, now),
    );
    if (lease.modifiedCount !== 1) {
      return Response.json({ error: { code: "FILE_NOT_AVAILABLE", message: "O certificado está sendo removido ou não está disponível." } }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    let leaseReleased = false;
    const releaseLease = () => {
      if (leaseReleased) return;
      leaseReleased = true;
      void db.collection("certificate_files.files").updateOne(
        { _id: id },
        buildReleaseDownloadLeasePipeline(leaseToken),
      ).catch(() => console.error("[certificates] Falha ao liberar reserva de download."));
    };

    let stream: Readable | undefined;
    try {
      const auditRecorded = await writeAuditEvent({ actor: access.login, action: "certificate.downloaded", entity: "certificate", entityId: String(file._id), metadata: { rowNumber } });
      const bucket = await getCertificatesBucket();
      stream = bucket.openDownloadStream(id);
      stream.once("close", releaseLease);
      stream.once("error", releaseLease);
      const safeName = sanitizeCertificateFileName(String(metadata.originalName || file.filename || "certificado.pfx"));
      const asciiName = toAsciiCertificateFileName(safeName);
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
      stream?.destroy();
      releaseLease();
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error, "api/certificates/[fileId]");
  }
}
