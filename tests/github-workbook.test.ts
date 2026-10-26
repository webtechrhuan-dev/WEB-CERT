import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import {
  GitHubWorkbookError,
  publishGitHubWorkbook,
} from "../lib/server/github-workbook";
import { WORKBOOK_HEADERS } from "../lib/workbook-types";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function configureGitHub() {
  vi.stubEnv("GITHUB_OWNER", "webtech");
  vi.stubEnv("GITHUB_REPO", "certificates");
  vi.stubEnv("GITHUB_BRANCH", "main");
  vi.stubEnv("GITHUB_DATA_PATH", "CERTIFICADOS_UNIFICADOS_2024-2026.xlsx");
  vi.stubEnv("GITHUB_TOKEN", "test-token");
}

async function validWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Todos os dados").addRow([...WORKBOOK_HEADERS]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function remoteSnapshotResponses() {
  return [
    jsonResponse({ object: { sha: "base-version" } }),
    jsonResponse({ tree: { sha: "base-tree" } }),
    jsonResponse({
      truncated: false,
      tree: [{
        path: "CERTIFICADOS_UNIFICADOS_2024-2026.xlsx",
        mode: "100644",
        type: "blob",
        sha: "old-blob",
      }],
    }),
    jsonResponse({
      encoding: "base64",
      content: Buffer.from("existing workbook bytes").toString("base64"),
    }),
  ];
}

describe("persistência GitHub", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("recusa uma versão obsoleta antes de criar qualquer objeto ou commit", async () => {
    configureGitHub();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "current-version" } }))
      .mockResolvedValueOnce(jsonResponse({ tree: { sha: "tree-version" } }))
      .mockResolvedValueOnce(jsonResponse({
        truncated: false,
        tree: [{
          path: "CERTIFICADOS_UNIFICADOS_2024-2026.xlsx",
          mode: "100644",
          type: "blob",
          sha: "blob-version",
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        encoding: "base64",
        content: Buffer.from("synthetic workbook").toString("base64"),
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishGitHubWorkbook({
        buffer: Buffer.from("not used"),
        expectedVersion: "stale-version",
        message: "Cadastro de registro",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<GitHubWorkbookError>);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("publica uma alteração validada em commit sem force-push", async () => {
    configureGitHub();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => remoteSnapshotResponses()[0])
      .mockImplementationOnce(async () => remoteSnapshotResponses()[1])
      .mockImplementationOnce(async () => remoteSnapshotResponses()[2])
      .mockImplementationOnce(async () => remoteSnapshotResponses()[3])
      .mockResolvedValueOnce(jsonResponse({ sha: "new-blob" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "new-tree" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "new-commit" }))
      .mockResolvedValueOnce(jsonResponse({ ref: "refs/heads/main" }));
    vi.stubGlobal("fetch", fetchMock);

    const version = await publishGitHubWorkbook({
      buffer: await validWorkbook(),
      expectedVersion: "base-version",
      message: "Cadastro de registro",
    });

    expect(version).toBe("new-commit");
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("PATCH");
    expect(fetchMock.mock.calls.at(-1)?.[1]?.body).toContain('"force":false');
  });
});
