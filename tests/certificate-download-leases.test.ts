import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_DOWNLOAD_LEASE_MS,
  buildAcquireDownloadLeasePipeline,
  buildCertificateDeletionClaimFilter,
  buildReleaseDownloadLeasePipeline,
} from "@/lib/server/certificate-download-leases";

describe("reservas concorrentes de download de certificados", () => {
  const now = new Date("2026-11-05T17:00:00.000Z");

  it("remove reservas vencidas e cria uma nova reserva com expiração", () => {
    expect(buildAcquireDownloadLeasePipeline("lease-a", now)).toEqual([
      {
        $set: {
          activeDownloadLeases: {
            $concatArrays: [
              {
                $filter: {
                  input: { $ifNull: ["$activeDownloadLeases", []] },
                  as: "activeLease",
                  cond: { $gt: ["$$activeLease.expiresAt", now] },
                },
              },
              [{ token: "lease-a", expiresAt: new Date(now.getTime() + CERTIFICATE_DOWNLOAD_LEASE_MS) }],
            ],
          },
        },
      },
    ]);
  });

  it("permite configurar a duração da reserva para testes/ambientes específicos", () => {
    const pipeline = buildAcquireDownloadLeasePipeline("lease-b", now, 5_000);
    const appended = (pipeline[0] as { $set: { activeDownloadLeases: { $concatArrays: unknown[] } } })
      .$set.activeDownloadLeases.$concatArrays[1];
    expect(appended).toEqual([{ token: "lease-b", expiresAt: new Date(now.getTime() + 5_000) }]);
  });

  it("libera somente o token correspondente sem substituir outras reservas", () => {
    expect(buildReleaseDownloadLeasePipeline("lease-a")).toEqual([
      {
        $set: {
          activeDownloadLeases: {
            $filter: {
              input: { $ifNull: ["$activeDownloadLeases", []] },
              as: "activeLease",
              cond: { $ne: ["$$activeLease.token", "lease-a"] },
            },
          },
        },
      },
    ]);
  });

  it("só permite reivindicar a exclusão quando não há leases ativos", () => {
    const id = new ObjectId("507f1f77bcf86cd799439011");
    expect(buildCertificateDeletionClaimFilter(id, 12, now)).toEqual({
      _id: id,
      "metadata.rowNumber": 12,
      deleting: { $ne: true },
      $or: [
        { activeDownloadLeases: { $exists: false } },
        { activeDownloadLeases: { $size: 0 } },
        { activeDownloadLeases: { $not: { $elemMatch: { expiresAt: { $gt: now } } } } },
      ],
    });
  });
});
