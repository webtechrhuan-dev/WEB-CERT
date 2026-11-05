import { GridFSBucket, MongoClient, ObjectId, type Db } from "mongodb";

const uri = process.env.MONGODB_CERTIFICATES_URI;
const dbName = process.env.MONGODB_CERTIFICATES_DB || "certificates_store";

if (!uri) {
  // Keep the main application usable when the optional certificate store is not configured.
}

declare global {
  // eslint-disable-next-line no-var
  var certificatesMongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient> | undefined;

function getClientPromise(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("MONGODB_CERTIFICATES_URI não está configurada.");
  }

  if (process.env.NODE_ENV === "development") {
    if (!global.certificatesMongoClientPromise) {
      global.certificatesMongoClientPromise = new MongoClient(uri).connect();
    }
    return global.certificatesMongoClientPromise;
  }

  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect();
  }
  return clientPromise;
}

export async function getCertificatesDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName);
}

export async function getCertificatesBucket(): Promise<GridFSBucket> {
  const db = await getCertificatesDb();
  return new GridFSBucket(db, { bucketName: "certificate_files" });
}


let certificateIndexesPromise: Promise<void> | undefined;

/** Índice para localizar anexos por venda sem varrer toda a coleção GridFS. */
export async function ensureCertificateStoreIndexes(): Promise<void> {
  if (!certificateIndexesPromise) {
    certificateIndexesPromise = (async () => {
      const db = await getCertificatesDb();
      await db.collection("certificate_files.files").createIndex(
        { "metadata.rowNumber": 1, uploadDate: -1 },
        { name: "certificate_row_upload_date" },
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
