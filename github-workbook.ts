import "server-only";

import { parseWorkbookBuffer } from "@/lib/server/workbook";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";

type GitHubConfig = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
};

type GitHubRef = {
  object: { sha: string };
};

type GitHubCommit = {
  tree: { sha: string };
};

type GitHubTreeEntry = {
  path: string;
  mode: string;
  type: string;
  sha: string;
};

type GitHubTree = {
  tree: GitHubTreeEntry[];
  truncated: boolean;
};

type GitHubBlob = {
  content: string;
  encoding: string;
};

type RemoteSnapshot = {
  buffer: Buffer;
  commitSha: string;
  treeSha: string;
  fileMode: string;
};

export type GitHubWorkbookErrorCode =
  | "NOT_CONFIGURED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ACCESS_DENIED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE";

export class GitHubWorkbookError extends Error {
  constructor(public readonly code: GitHubWorkbookErrorCode) {
    super("Não foi possível acessar a planilha versionada.");
    this.name = "GitHubWorkbookError";
  }
}

function getConfig(): GitHubConfig {
  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, GITHUB_DATA_PATH, GITHUB_TOKEN } =
    process.env;

  if (
    !GITHUB_OWNER ||
    !GITHUB_REPO ||
    !GITHUB_BRANCH ||
    !GITHUB_DATA_PATH ||
    !GITHUB_TOKEN
  ) {
    throw new GitHubWorkbookError("NOT_CONFIGURED");
  }

  return {
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    branch: GITHUB_BRANCH,
    path: GITHUB_DATA_PATH,
    token: GITHUB_TOKEN,
  };
}

export function isGitHubWorkbookConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_OWNER &&
      process.env.GITHUB_REPO &&
      process.env.GITHUB_BRANCH &&
      process.env.GITHUB_DATA_PATH &&
      process.env.GITHUB_TOKEN,
  );
}

function repositoryUrl(config: GitHubConfig, path: string): string {
  return `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${path}`;
}

function branchRefUrl(config: GitHubConfig): string {
  const branch = config.branch.split("/").map(encodeURIComponent).join("/");
  return repositoryUrl(config, `git/ref/heads/${branch}`);
}

async function githubRequest<T>(
  config: GitHubConfig,
  url: string,
  init?: RequestInit,
  conflictOnUnprocessable = false,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": API_VERSION,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new GitHubWorkbookError("UNAVAILABLE");
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new GitHubWorkbookError("NOT_FOUND");
    }
    if (response.status === 401 || response.status === 403) {
      throw new GitHubWorkbookError("ACCESS_DENIED");
    }
    if (response.status === 409 || (conflictOnUnprocessable && response.status === 422)) {
      throw new GitHubWorkbookError("CONFLICT");
    }
    throw new GitHubWorkbookError("UNAVAILABLE");
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new GitHubWorkbookError("INVALID_RESPONSE");
  }
}

async function readRemoteSnapshot(config: GitHubConfig): Promise<RemoteSnapshot> {
  const ref = await githubRequest<GitHubRef>(config, branchRefUrl(config));
  const commit = await githubRequest<GitHubCommit>(
    config,
    repositoryUrl(config, `git/commits/${encodeURIComponent(ref.object.sha)}`),
  );
  const tree = await githubRequest<GitHubTree>(
    config,
    repositoryUrl(
      config,
      `git/trees/${encodeURIComponent(commit.tree.sha)}?recursive=1`,
    ),
  );
  if (tree.truncated) {
    throw new GitHubWorkbookError("INVALID_RESPONSE");
  }

  const file = tree.tree.find(
    (entry) => entry.path === config.path && entry.type === "blob",
  );
  if (!file) {
    throw new GitHubWorkbookError("NOT_FOUND");
  }

  const blob = await githubRequest<GitHubBlob>(
    config,
    repositoryUrl(config, `git/blobs/${encodeURIComponent(file.sha)}`),
  );
  if (blob.encoding !== "base64") {
    throw new GitHubWorkbookError("INVALID_RESPONSE");
  }

  return {
    buffer: Buffer.from(blob.content.replace(/\s/g, ""), "base64"),
    commitSha: ref.object.sha,
    treeSha: commit.tree.sha,
    fileMode: file.mode,
  };
}

export async function readGitHubWorkbook(): Promise<{
  buffer: Buffer;
  version: string;
}> {
  const config = getConfig();
  const snapshot = await readRemoteSnapshot(config);
  return { buffer: snapshot.buffer, version: snapshot.commitSha };
}

export async function publishGitHubWorkbook(input: {
  buffer: Buffer;
  expectedVersion: string;
  message: "Cadastro de registro" | "Edição de registro";
}): Promise<string> {
  const config = getConfig();
  const current = await readRemoteSnapshot(config);
  if (current.commitSha !== input.expectedVersion) {
    throw new GitHubWorkbookError("CONFLICT");
  }

  await parseWorkbookBuffer(input.buffer);

  const blob = await githubRequest<{ sha: string }>(
    config,
    repositoryUrl(config, "git/blobs"),
    {
      method: "POST",
      body: JSON.stringify({
        content: input.buffer.toString("base64"),
        encoding: "base64",
      }),
    },
  );
  const tree = await githubRequest<{ sha: string }>(
    config,
    repositoryUrl(config, "git/trees"),
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: current.treeSha,
        tree: [
          {
            path: config.path,
            mode: current.fileMode,
            type: "blob",
            sha: blob.sha,
          },
        ],
      }),
    },
  );
  const commit = await githubRequest<{ sha: string }>(
    config,
    repositoryUrl(config, "git/commits"),
    {
      method: "POST",
      body: JSON.stringify({
        message: `${input.message} (${new Date().toISOString()})`,
        tree: tree.sha,
        parents: [current.commitSha],
      }),
    },
  );

  try {
    await githubRequest(
      config,
      branchRefUrl(config),
      {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      },
      true,
    );
    return commit.sha;
  } catch (error) {
    if (error instanceof GitHubWorkbookError && error.code === "CONFLICT") {
      throw error;
    }

    const latest = await readRemoteSnapshot(config);
    if (latest.commitSha === commit.sha) {
      return commit.sha;
    }
    if (latest.commitSha !== current.commitSha) {
      throw new GitHubWorkbookError("CONFLICT");
    }
    throw new GitHubWorkbookError("UNAVAILABLE");
  }
}
