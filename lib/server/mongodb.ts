import "server-only";
import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "web_cert";
if (!uri) throw new Error("MONGODB_URI não configurada.");

declare global {
  // Reutiliza o cliente entre invocações quentes do mesmo processo serverless.
  // A promessa é descartada em caso de falha para permitir uma nova tentativa.
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (!global.__mongoClientPromise) {
    const client = new MongoClient(uri!);
    global.__mongoClientPromise = client.connect().catch(async (error) => {
      global.__mongoClientPromise = undefined;
      await client.close().catch(() => undefined);
      throw error;
    });
  }
  return global.__mongoClientPromise;
}

export async function getMongoDb(): Promise<Db> {
  return (await getClientPromise()).db(dbName);
}
