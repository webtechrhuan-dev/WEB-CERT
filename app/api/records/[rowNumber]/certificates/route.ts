import { randomUUID } from "node:crypto";
import { WORKBOOK_HEADERS } from "@/lib/workbook-types";
import { encryptCertificatePassword } from "@/lib/server/certificate-password";
import { sanitizeCertificateFileName } from "@/lib/certificate-file-name";
import { buildCertificateDeletionClaimFilter, CERTIFICATE_DELETION_LEASE_MS } from "@/lib/server/certificate-download-leases";
import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { readBodyBytes, readJsonBody } from "@/lib/server/request-body";
import { getMongoDb } from "@/lib/server/mongodb";
import { cleanupGridFsUpload } from "@/lib/server/gridfs-cleanup";
import { acquireCertificateMutationLock, releaseCertificateMutationLock } from "@/lib/server/certificate-store";
import {
  getCertificatesBucket,
  getCertificatesDb,
  ensureCertificateStoreIndexes,
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
  expiresAt: Date;
  passwordEncrypted: { algorithm: string; iv: string; authTag: string; ciphertext: string };
};

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function getSale(rowNumber: number): Promise<{ values?: unknown[] } | null> {
  const db = await getMongoDb();
  return db.collection("certificates").findOne(
    { rowNumber },
    { projection: { _id: 1, values: 1 } },
  ) as Promise<{ values?: unknown[] } | null>;
}

function saleAllowsCertificate(sale: { values?: unknown[] } | null): boolean {
  if (!sale || !Array.isArray(sale.values)) return false;
  const statusIndex = WORKBOOK_HEADERS.indexOf("Status / Observação");
  const status = String(sale.values[statusIndex] ?? "").trim().toLocaleLowerCase("pt-BR");
  return ["emitido", "pendente instalar", "instalado", "concluido", "concluído"].includes(status);
}

async function ensureSaleExists(rowNumber: number): Promise<boolean> {
  return Boolean(await getSale(rowNumber));
}

export async function GET(_request: Request, context: { params: Promise<{ rowNumber: string }> }) {
  try {
    await requireAccess();
    const rowNumber = Number((await context.params).rowNumber);
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) return jsonError("INVALID_ROW", "Venda inválida.", 400);
    if (!(await ensureSaleExists(rowNumber))) return jsonError("RECORD_NOT_FOUND", "Venda não encontrada.", 404);

    await ensureCertificateStoreIndexes();
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
          expiresAt: metadata.expiresAt ?? null,
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
    const sale = await getSale(rowNumber);
    if (!sale) return jsonError("RECORD_NOT_FOUND", "Venda não encontrada.", 404);
    if (!saleAllowsCertificate(sale)) return jsonError("SALE_STATUS_NOT_ELIGIBLE", "Só é possível vincular certificado a vendas com status Emitido, Pendente instalar, Instalado ou Concluido.", 409);

    // Limita o corpo multipart inteiro, mesmo quando Content-Length é omitido ou falso.
    // O teto inclui até 256 KB de boundary/campos/metadados além do arquivo de 10 MB.
    const multipartBytes = await readBodyBytes(request, MAX_CERTIFICATE_SIZE + 256_000);
    const boundedHeaders = new Headers(request.headers);
    boundedHeaders.delete("content-length");
    boundedHeaders.delete("transfer-encoding");
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: boundedHeaders,
      body: Buffer.from(multipartBytes),
    });
    let form: FormData;
    try {
      form = await boundedRequest.formData();
    } catch {
      return jsonError("MALFORMED_MULTIPART", "O formulário de envio está inválido ou incompleto.", 400);
    }
    const file = form.get("file");
    const password = form.get("password");
    if (typeof password !== "string" || !password.trim()) return jsonError("CERTIFICATE_PASSWORD_REQUIRED", "Informe a senha do certificado PFX.", 400);
    const expiryIndex = WORKBOOK_HEADERS.indexOf("Data de vencimento");
    const saleExpiry = sale.values?.[expiryIndex];
    const expiryInput = typeof saleExpiry === "string" ? saleExpiry : (typeof saleExpiry === "object" && saleExpiry !== null && "parsed" in saleExpiry && typeof saleExpiry.parsed === "string" ? saleExpiry.parsed : "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryInput)) return jsonError("SALE_EXPIRY_MISSING", "Defina uma data de vencimento válida no cadastro da venda antes de anexar o certificado.", 409);
    const expiresAt = new Date(`${expiryInput}T23:59:59.999Z`);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.toISOString().slice(0, 10) !== expiryInput) return jsonError("SALE_EXPIRY_INVALID", "A data de vencimento cadastrada nesta venda é inválida.", 409);
    if (!(file instanceof File)) return jsonError("FILE_REQUIRED", "Selecione um arquivo de certificado.", 400);
    if (file.size <= 0) return jsonError("EMPTY_FILE", "O arquivo está vazio.", 400);
    if (file.size > MAX_CERTIFICATE_SIZE) return jsonError("FILE_TOO_LARGE", "O arquivo excede o limite de 10 MB.", 413);

    const originalName = sanitizeCertificateFileName(file.name);
    if (!/\.pfx$/i.test(originalName)) {
      return jsonError("INVALID_CERTIFICATE_TYPE", "Envie somente arquivos de certificado .pfx.", 415);
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
      // Revalida o status depois de adquirir o lock: a venda pode ter sido
      // alterada enquanto o arquivo era enviado/aguardava outra operação.
      const saleAfterLock = await getSale(rowNumber);
      if (!saleAfterLock) return jsonError("RECORD_NOT_FOUND", "Venda não encontrada.", 404);
      if (!saleAllowsCertificate(saleAfterLock)) {
        return jsonError("SALE_STATUS_NOT_ELIGIBLE", "O status desta venda não permite vincular certificado.", 409);
      }
      const existing = await (await getCertificatesDb()).collection("certificate_files.files").findOne({ "metadata.rowNumber": rowNumber }, { projection: { _id: 1 } });
      if (existing) return jsonError("CERTIFICATE_ALREADY_LINKED", "Esta venda já possui um certificado vinculado. Exclua o atual antes de cadastrar outro.", 409);
      const uploadedAt = new Date();
      const passwordEncrypted = encryptCertificatePassword(password);
      const bucket = await getCertificatesBucket();
      const upload = bucket.openUploadStream(originalName, {
        contentType: "application/x-pkcs12",
        metadata: {
          rowNumber,
          originalName,
          contentType: "application/x-pkcs12",
          uploadedBy: access.login,
          uploadedAt,
          expiresAt,
          passwordEncrypted,
        } satisfies CertificateMetadata,
      });

      try {
        await new Promise<void>((resolve, reject) => {
          upload.once("error", reject);
          upload.once("finish", resolve);
          upload.end(bytes);
        });
      } catch (uploadError) {
        // GridFS pode ter gravado chunks antes da falha; remove o upload parcial.
        try {
          const cleaned = await cleanupGridFsUpload(await getCertificatesDb(), upload.id);
          if (!cleaned) console.error("[certificates] Falha ao limpar upload GridFS interrompido.");
        } catch {
          console.error("[certificates] Falha ao limpar upload GridFS interrompido.");
        }
        throw uploadError;
      }

      if (!(await ensureSaleExists(rowNumber))) {
        try {
          const cleaned = await cleanupGridFsUpload(await getCertificatesDb(), upload.id);
          if (!cleaned) console.error("[certificates] Falha ao reverter upload sem venda vinculada.");
        } catch {
          console.error("[certificates] Falha ao reverter upload sem venda vinculada.");
        }
        return jsonError("RECORD_NOT_FOUND", "A venda foi removida durante o envio. O arquivo não foi mantido.", 404);
      }

      return Response.json({ ok: true, id: String(upload.id), name: originalName, expiresAt }, {
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
    const body = await readJsonBody(request);
    const id = typeof body?.fileId === "string" ? parseObjectId(body.fileId) : null;
    if (!id) return jsonError("INVALID_FILE_ID", "Arquivo inválido.", 400);

    await ensureCertificateStoreIndexes();
    const db = await getCertificatesDb();
    const file = await db.collection("certificate_files.files").findOne(
      { _id: id, "metadata.rowNumber": rowNumber },
      { projection: { _id: 1 } },
    );
    if (!file) return jsonError("FILE_NOT_FOUND", "Certificado não encontrado nesta venda.", 404);

    // A exclusão só reivindica o arquivo quando não há downloads ativos.
    // O update é atômico com a reserva feita pela rota de download.
    const deletionToken = randomUUID();
    const deletionStartedAt = new Date();
    const deletionClaim = await db.collection("certificate_files.files").updateOne(
      buildCertificateDeletionClaimFilter(id, rowNumber, deletionStartedAt),
      {
        $set: {
          deleting: true,
          deletingLeaseToken: deletionToken,
          deletingLeaseExpiresAt: new Date(deletionStartedAt.getTime() + CERTIFICATE_DELETION_LEASE_MS),
        },
      },
    );
    if (deletionClaim.modifiedCount !== 1) {
      return jsonError("FILE_IN_USE", "O certificado está sendo baixado ou removido. Aguarde e tente novamente.", 409);
    }

    try {
      const bucket = await getCertificatesBucket();
      await bucket.delete(id);
    } catch (error) {
      await db.collection("certificate_files.files").updateOne(
        { _id: id, deletingLeaseToken: deletionToken },
        { $unset: { deleting: "", deletingLeaseToken: "", deletingLeaseExpiresAt: "" } },
      ).catch(() => console.error("[certificates] Falha ao liberar marca de exclusão."));
      throw error;
    }
    return Response.json({ ok: true, deleted: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "api/records/[rowNumber]/certificates");
  }
}
