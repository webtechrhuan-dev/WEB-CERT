import { randomUUID } from "node:crypto";
import { buildCertificateDeletionClaimFilter, CERTIFICATE_DELETION_LEASE_MS } from "@/lib/server/certificate-download-leases";
import { getCertificatesBucket, getCertificatesDb } from "@/lib/server/certificates-mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BATCH_SIZE = 50;

/** Limpeza server-side idempotente; chamada pelo Vercel Cron com CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const db = await getCertificatesDb();
  const now = new Date();
  const expired = await db.collection("certificate_files.files")
    .find({
      "metadata.expiresAt": { $lte: now },
      $or: [
        { deleting: { $ne: true } },
        { deletingLeaseExpiresAt: { $lte: now } },
      ],
    }, { projection: { _id: 1, "metadata.rowNumber": 1 } })
    .sort({ "metadata.expiresAt": 1 })
    .limit(BATCH_SIZE)
    .toArray();

  const bucket = await getCertificatesBucket();
  let deleted = 0;
  let deferred = 0;
  for (const file of expired) {
    const rowNumber = Number(file.metadata?.rowNumber);
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) { deferred++; continue; }
    const token = randomUUID();
    const claimTime = new Date();
    const claim = await db.collection("certificate_files.files").updateOne(
      buildCertificateDeletionClaimFilter(file._id, rowNumber, claimTime),
      { $set: { deleting: true, deletingLeaseToken: token, deletingLeaseExpiresAt: new Date(claimTime.getTime() + CERTIFICATE_DELETION_LEASE_MS) } },
    );
    if (claim.modifiedCount !== 1) { deferred++; continue; }
    try {
      await bucket.delete(file._id);
      deleted++;
    } catch {
      await db.collection("certificate_files.files").updateOne(
        { _id: file._id, deletingLeaseToken: token },
        { $unset: { deleting: "", deletingLeaseToken: "", deletingLeaseExpiresAt: "" } },
      ).catch(() => undefined);
      deferred++;
    }
  }
  return Response.json({ ok: true, scanned: expired.length, deleted, deferred, hasMore: expired.length === BATCH_SIZE }, {
    headers: { "Cache-Control": "no-store" },
  });
}
