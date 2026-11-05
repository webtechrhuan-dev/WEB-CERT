import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMongoDb } = vi.hoisted(() => ({ getMongoDb: vi.fn() }));
vi.mock("../lib/server/mongodb", () => ({ getMongoDb }));

import {
  acquireCertificateMutationLock,
  releaseCertificateMutationLock,
} from "../lib/server/certificate-store";

describe("lock de mutação dos anexos", () => {
  beforeEach(() => getMongoDb.mockReset());

  it("adquire o lock por venda com token e expiração", async () => {
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    getMongoDb.mockResolvedValue({ collection: () => ({ updateOne }) });

    await expect(acquireCertificateMutationLock(12, "token-a")).resolves.toBe(true);

    expect(updateOne).toHaveBeenCalledWith(
      {
        rowNumber: 12,
        $or: [
          { certificateMutationLockExpiresAt: { $exists: false } },
          { certificateMutationLockExpiresAt: { $lt: expect.any(Date) } },
        ],
      },
      {
        $set: {
          certificateMutationLockToken: "token-a",
          certificateMutationLockExpiresAt: expect.any(Date),
        },
      },
    );
  });

  it("recusa uma segunda operação enquanto o lock estiver ativo", async () => {
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    getMongoDb.mockResolvedValue({ collection: () => ({ updateOne }) });

    await expect(acquireCertificateMutationLock(12, "token-b")).resolves.toBe(false);
  });

  it("libera somente o lock pertencente ao token informado", async () => {
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    getMongoDb.mockResolvedValue({ collection: () => ({ updateOne }) });

    await releaseCertificateMutationLock(12, "token-a");

    expect(updateOne).toHaveBeenCalledWith(
      { rowNumber: 12, certificateMutationLockToken: "token-a" },
      { $unset: { certificateMutationLockToken: "", certificateMutationLockExpiresAt: "" } },
    );
  });
});
