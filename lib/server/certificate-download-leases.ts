import type { Document, ObjectId } from "mongodb";

export const CERTIFICATE_DOWNLOAD_LEASE_MS = 30 * 60 * 1000;
export const CERTIFICATE_DELETION_LEASE_MS = 30 * 60 * 1000;

/** Pipeline atômico: remove leases vencidos e acrescenta a reserva atual. */
export function buildAcquireDownloadLeasePipeline(
  token: string,
  now: Date,
  leaseMs = CERTIFICATE_DOWNLOAD_LEASE_MS,
): Document[] {
  return [
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
            [{ token, expiresAt: new Date(now.getTime() + leaseMs) }],
          ],
        },
      },
    },
  ];
}

/** Renova somente o lease pertencente a este download, sem tocar nos demais. */
export function buildRenewDownloadLeasePipeline(
  token: string,
  expiresAt: Date,
): Document[] {
  return [
    {
      $set: {
        activeDownloadLeases: {
          $map: {
            input: { $ifNull: ["$activeDownloadLeases", []] },
            as: "activeLease",
            in: {
              $cond: [
                { $eq: ["$$activeLease.token", token] },
                { $mergeObjects: ["$$activeLease", { expiresAt }] },
                "$$activeLease",
              ],
            },
          },
        },
      },
    },
  ];
}

/** Pipeline atômico e idempotente para liberar somente a reserva informada. */
export function buildReleaseDownloadLeasePipeline(token: string): Document[] {
  return [
    {
      $set: {
        activeDownloadLeases: {
          $filter: {
            input: { $ifNull: ["$activeDownloadLeases", []] },
            as: "activeLease",
            cond: { $ne: ["$$activeLease.token", token] },
          },
        },
      },
    },
  ];
}

/** Filtro de claim da exclusão; leases expirados não bloqueiam remoção para sempre. */
export function buildCertificateDeletionClaimFilter(
  id: ObjectId,
  rowNumber: number,
  now: Date,
): Document {
  return {
    _id: id,
    "metadata.rowNumber": rowNumber,
    $and: [
      {
        $or: [
          { deleting: { $ne: true } },
          { deletingLeaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $or: [
          { activeDownloadLeases: { $exists: false } },
          { activeDownloadLeases: { $size: 0 } },
          { activeDownloadLeases: { $not: { $elemMatch: { expiresAt: { $gt: now } } } } },
        ],
      },
    ],
  };
}
