import { Readable } from "node:stream";
import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { getMongoDb } from "@/lib/server/mongodb";
import {
  getCertificatesBucket,
  getCertificatesDb,
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
      upload.end(Buffer.from(awaitFileBytes(file)));
    });

    return Response.json({ ok: true, id: String(upload.id), name: originalName }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "api/records/[rowNumber]/certificates");
  }
}

async function awaitFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
