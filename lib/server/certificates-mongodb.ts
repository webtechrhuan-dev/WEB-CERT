import { GridFSBucket, MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_CERTIFICATES_URI;
const dbName = process.env.MONGODB_CERTIFICATES_DB || "certificates_store";

if (!uri) {
  throw new Error("MONGODB_CERTIFICATES_URI não configurada.");
}

declare global {
  // eslint-disable-next-line no-var
  var certificatesMongoClientPromise: Promise<MongoClient> | undefined;
}

const clientPromise =
  globalThis.certificatesMongoClientPromise ??
  new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 }).connect();

if (process.env.NODE_ENV !== "production") {
  globalThis.certificatesMongoClientPromise = clientPromise;
}

export async function getCertificatesDb() {
  const client = await clientPromise;
  return client.db(dbName);
}

export async function getCertificatesBucket() {
  const db = await getCertificatesDb();
  return new GridFSBucket(db, { bucketName: "certificate_files" });
}

export function parseObjectId(value: string) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export const MAX_CERTIFICATE_SIZE = 10 * 1024 * 1024;
