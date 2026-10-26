import "server-only";

import { createHash } from "node:crypto";
import {
  GitHubWorkbookError,
  isGitHubWorkbookConfigured,
  readGitHubWorkbook,
} from "@/lib/server/github-workbook";
import {
  getWorkbookPath,
  parseWorkbookBuffer,
  readWorkbookBufferFromPath,
} from "@/lib/server/workbook";
import type { WorkbookData } from "@/lib/workbook-types";

export type WorkbookSnapshot = {
  buffer: Buffer;
  data: WorkbookData;
  source: "github" | "local";
  version: string;
};

export class WorkbookPersistenceError extends Error {
  constructor(public readonly code: "NOT_CONFIGURED") {
    super("A persistência da planilha não está configurada.");
    this.name = "WorkbookPersistenceError";
  }
}

export async function readWorkbookSnapshot(): Promise<WorkbookSnapshot> {
  if (isGitHubWorkbookConfigured()) {
    const remote = await readGitHubWorkbook();
    const data = await parseWorkbookBuffer(remote.buffer);
    return {
      buffer: remote.buffer,
      data,
      source: "github",
      version: remote.version,
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new WorkbookPersistenceError("NOT_CONFIGURED");
  }

  const buffer = await readWorkbookBufferFromPath(getWorkbookPath());
  const data = await parseWorkbookBuffer(buffer);
  const version = createHash("sha256").update(buffer).digest("hex");
  return {
    buffer,
    data,
    source: "local",
    version: `local:${version}`,
  };
}

export async function requireGitHubSnapshot(
  expectedVersion?: string,
): Promise<WorkbookSnapshot> {
  if (!isGitHubWorkbookConfigured()) {
    throw new WorkbookPersistenceError("NOT_CONFIGURED");
  }

  const snapshot = await readWorkbookSnapshot();
  if (snapshot.source !== "github") {
    throw new WorkbookPersistenceError("NOT_CONFIGURED");
  }
  if (expectedVersion !== undefined && snapshot.version !== expectedVersion) {
    throw new GitHubWorkbookError("CONFLICT");
  }
  return snapshot;
}
