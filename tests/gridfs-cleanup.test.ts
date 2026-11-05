import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { cleanupGridFsUpload } from "@/lib/server/gridfs-cleanup";

describe("limpeza de upload GridFS interrompido", () => {
  it("remove o documento e os chunks mesmo quando o upload ficou incompleto", async () => {
    const id = new ObjectId("507f1f77bcf86cd799439011");
    const deleteFile = vi.fn().mockResolvedValue({ deletedCount: 0 });
    const deleteChunks = vi.fn().mockResolvedValue({ deletedCount: 3 });
    const db = {
      collection: (name: string) => ({
        deleteMany: name.endsWith(".files") ? deleteFile : deleteChunks,
      }),
    } as never;

    await expect(cleanupGridFsUpload(db, id)).resolves.toBe(true);
    expect(deleteFile).toHaveBeenCalledWith({ _id: id });
    expect(deleteChunks).toHaveBeenCalledWith({ files_id: id });
  });

  it("tenta limpar as duas coleções e sinaliza falha parcial", async () => {
    const id = new ObjectId("507f1f77bcf86cd799439011");
    const deleteFile = vi.fn().mockRejectedValue(new Error("files unavailable"));
    const deleteChunks = vi.fn().mockResolvedValue({ deletedCount: 1 });
    const db = {
      collection: (name: string) => ({
        deleteMany: name.endsWith(".files") ? deleteFile : deleteChunks,
      }),
    } as never;

    await expect(cleanupGridFsUpload(db, id)).resolves.toBe(false);
    expect(deleteChunks).toHaveBeenCalledWith({ files_id: id });
  });
});
