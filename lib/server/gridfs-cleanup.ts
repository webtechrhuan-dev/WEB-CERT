import type { Db, ObjectId } from "mongodb";

/**
 * Remove both GridFS documents and chunks after an interrupted upload.
 * GridFSBucket.delete() can fail when the upload never reached the files
 * document, leaving chunks behind; direct cleanup covers that partial state.
 */
export async function cleanupGridFsUpload(db: Db, id: ObjectId): Promise<boolean> {
  const results = await Promise.allSettled([
    db.collection("certificate_files.files").deleteMany({ _id: id }),
    db.collection("certificate_files.chunks").deleteMany({ files_id: id }),
  ]);

  return results.every((result) => result.status === "fulfilled");
}
