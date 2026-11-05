import "server-only";
import { GridFSBucket, ObjectId } from "mongodb";
import { getMongoDb } from "@/lib/server/mongodb";

/** Os arquivos GridFS compartilham a mesma conexão e o mesmo banco das vendas. */
export async function getCertificatesDb() {
  return getMongoDb();
}

export async function getCertificatesBucket(): Promise<GridFSBucket> {
  return new GridFSBucket(await getCertificatesDb(), { bucketName: "certificate_files" });
}

let certificateIndexesPromise: Promise<void> | undefined;

/** Índice de consulta por venda; unicidade será aplicada após validar os anexos legados. */
export async function ensureCertificateStoreIndexes(): Promise<void> {
  if (!certificateIndexesPromise) {
    certificateIndexesPromise = (async () => {
      const db = await getCertificatesDb();
      await db.collection("certificate_files.files").createIndex(
        { "metadata.rowNumber": 1, uploadDate: -1 },
        { name: "certificate_row_upload_date" },
      );
      await db.collection("certificate_files.files").createIndex(
        { "metadata.expiresAt": 1 },
        { name: "certificate_expiry" },
      );
    })();
  }
  try {
    await certificateIndexesPromise;
  } catch (error) {
    certificateIndexesPromise = undefined;
    throw error;
  }
}

export function parseObjectId(value: string): ObjectId | null {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export const MAX_CERTIFICATE_SIZE = 10 * 1024 * 1024;
