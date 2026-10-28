import "server-only";
import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "web_cert";
if (!uri) throw new Error("MONGODB_URI não configurada.");

declare global { var __mongoClientPromise: Promise<MongoClient> | undefined; }
const clientPromise = global.__mongoClientPromise ?? new MongoClient(uri).connect();
if (process.env.NODE_ENV !== "production") global.__mongoClientPromise = clientPromise;

export async function getMongoDb(): Promise<Db> {
  return (await clientPromise).db(dbName);
}
