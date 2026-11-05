import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { writeAuditEvent } from "@/lib/server/audit-log";
import { getMongoDb } from "@/lib/server/mongodb";
import { acquireCertificateMutationLock, releaseCertificateMutationLock } from "@/lib/server/certificate-store";
import {
  getCertificatesBucket,
  getCertificatesDb,
  parseObjectId,
  MAX_CERTIFICATE_SIZE,
} from "@/lib/server/certificates-mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CertificateMetadata = {
  rowNumber: number;
  originalName: string;
  contentType: string;
  uploadedBy: string;
  uploadedAt: Date;
};

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safeFileName(value: string): string {
  const name = value.normalize("NFKC").replace(/[\\/\\\\\r\n\0]/g, "_").trim();
  return name.slice(0, 160) || "certificado.pfx";
}

async function ensureSaleExists(rowNumber: number): Promise<boolean> {
  const db = await getMongoDb();
  return Boolean(await db.collection("certificates").findOne(
    { rowNumber },
    { projection: { _id: 1 } },
  ));
}

export async function GET(_request: Request, context: { params: Promise<{ rowNumber: string }> }) {
  try {
    await requireAccess();
    const rowNumber = Number((await context.params).rowNumber);
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) return jsonError("INVALID_ROW", "Venda inválida.", 400);
    if (!(await ensureSaleExists(rowNumber))) return jsonError("RECORD_NOT_FOUND", "Venda não encontrada.", 404);

    const db = await getCertificatesDb();
    const files = await db.collection("certificate_files.files")
      .find({ "metadata.rowNumber": rowNumber }, {
        projection: { filename: 1, length: 1, uploadDate: 1, metadata: 1 },
      })
      .sort({ uploadDate: -1 })
      .limit(50)
      .toArray();

    return Response.json({
      certificates: files.map((file) => {
        const metadata = (file.metadata ?? {}) as CertificateMetadata;
        return {
          id: String(file._id),
          name: metadata.originalName || file.filename,
          size: file.length,
          uploadedAt: metadata.uploadedAt ?? file.uploadDate,
          uploadedBy: metadata.uploadedBy ?? "—",
        };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "api/records/[rowNumber]/certificates");
  }
}

export async function POST(request: Request, context: { params: Promise<{ rowNumber: string }> }) {
  try {
    const access = await requireAccess("editor");
    const rowNumber = Number((await context.params).rowNumber);
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) return jsonError("INVALID_ROW", "Venda inválida.", 400);
    if (!(await ensureSaleExists(rowNumber))) return jsonError("RECORD_NOT_FOUND", "Venda não encontrada.", 404);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("FILE_REQUIRED", "Selecione um arquivo de certificado.", 400);
    if (file.size <= 0) return jsonError("EMPTY_FILE", "O arquivo está vazio.", 400);
    if (file.size > MAX_CERTIFICATE_SIZE) return jsonError("FILE_TOO_LARGE", "O arquivo excede o limite de 10 MB.", 413);

    const originalName = safeFileName(file.name);
    if (!/\.(p12|pfx)$/i.test(originalName)) {
      return jsonError("INVALID_CERTIFICATE_TYPE", "Envie somente arquivos de certificado .p12 ou .pfx.", 415);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // PKCS#12 é codificado como ASN.1 DER e começa por uma estrutura SEQUENCE.
    if (bytes.length < 4 || bytes[0] !== 0x30) {
      return jsonError("INVALID_CERTIFICATE_CONTENT", "O conteúdo não parece ser um arquivo PKCS#12 válido.", 415);
    }

    const mutationToken = randomUUID();
    if (!(await acquireCertificateMutationLock(rowNumber, mutationToken))) {
      return jsonError("CERTIFICATE_OPERATION_IN_PROGRESS", "Outra operação está em andamento para esta venda. Tente novamente.", 409);
    }
    try {
      const uploadedAt = new Date();
      const bucket = await getCertificatesBucket();
      const upload = bucket.openUploadStream(originalName, {
        contentType: "application/x-pkcs12",
        metadata: {
          rowNumber,
          originalName,
          contentType: "application/x-pkcs12",
          uploadedBy: access.login,
          uploadedAt,
        } satisfies CertificateMetadata,
      });

      await new Promise<void>((resolve, reject) => {
        upload.once("error", reject);
        upload.once("finish", resolve);
        upload.end(bytes);
      });

      if (!(await ensureSaleExists(rowNumber))) {
        await bucket.delete(upload.id).catch(() => {
          console.error("[certificates] Falha ao reverter upload sem venda vinculada.");
        });
        return jsonError("RECORD_NOT_FOUND", "A venda foi removida durante o envio. O arquivo não foi mantido.", 404);
      }

      const auditRecorded = await writeAuditEvent({ actor: access.login, action: "certificate.uploaded", entity: "certificate", entityId: String(upload.id), metadata: { rowNumber, extension: originalName.toLowerCase().endsWith(".p12") ? ".p12" : ".pfx", size: file.size } });
      return Response.json({ ok: true, id: String(upload.id), name: originalName, auditRecorded }, {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      });
    } finally {
      await releaseCertificateMutationLock(rowNumber, mutationToken).catch(() => {
        console.error("[certificates] Falha ao liberar lock de mutação.");
      });
    }
  } catch (error) {
    return apiErrorResponse(error, "api/records/[rowNumber]/certificates");
  }
}



export async function DELETE(request: Request, context: { params: Promise<{ rowNumber: string }> }) {
  try {
    const access = await requireAccess("editor");
    const rowNumber = Number((await context.params).rowNumber);
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) return jsonError("INVALID_ROW", "Venda inválida.", 400);
    const body = await request.json().catch(() => null);
    const id = typeof body?.fileId === "string" ? parseObjectId(body.fileId) : null;
    if (!id) return jsonError("INVALID_FILE_ID", "Arquivo inválido.", 400);

    const db = await getCertificatesDb();
    const file = await db.collection("certificate_files.files").findOne(
      { _id: id, "metadata.rowNumber": rowNumber },
      { projection: { _id: 1 } },
    );
    if (!file) return jsonError("FILE_NOT_FOUND", "Certificado não encontrado nesta venda.", 404);

    const bucket = await getCertificatesBucket();
    await bucket.delete(id);
    const auditRecorded = await writeAuditEvent({
      actor: access.login,
      action: "certificate.deleted",
      entity: "certificate",
      entityId: String(id),
      metadata: { rowNumber },
    });
    return Response.json({ ok: true, deleted: true, auditRecorded }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "api/records/[rowNumber]/certificates");
  }
}
