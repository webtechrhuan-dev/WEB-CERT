import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, findOne, getMongoDb } = vi.hoisted(() => ({
  auth: vi.fn(),
  findOne: vi.fn(),
  getMongoDb: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/server/mongodb", () => ({ getMongoDb }));

import { AccessError, requireAccess } from "../lib/server/access";

describe("autorização baseada no estado atual da conta", () => {
  beforeEach(() => {
    auth.mockReset();
    findOne.mockReset();
    getMongoDb.mockReset();
    auth.mockResolvedValue({ user: { login: "arthur", role: "admin", isAdmin: true } });
    getMongoDb.mockResolvedValue({ collection: vi.fn(() => ({ findOne })) });
    findOne.mockResolvedValue({ username: "arthur", role: "editor", active: true });
  });

  it("usa a função atual do banco, não a função antiga presente no JWT", async () => {
    await expect(requireAccess("admin")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(findOne).toHaveBeenCalledWith(
      { username: "arthur" },
      { projection: { username: 1, role: 1, active: 1 } },
    );
  });

  it("bloqueia imediatamente uma conta desativada mesmo com sessão válida", async () => {
    findOne.mockResolvedValue({ username: "arthur", role: "admin", active: false });
    await expect(requireAccess()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("mantém compatibilidade com contas antigas sem o campo active", async () => {
    findOne.mockResolvedValue({ username: "arthur", role: "editor" });
    await expect(requireAccess("editor")).resolves.toEqual({
      login: "arthur",
      role: "editor",
    });
  });

  it("nega sessões sem login antes de consultar o banco", async () => {
    auth.mockResolvedValue({ user: {} });
    await expect(requireAccess()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(getMongoDb).not.toHaveBeenCalled();
  });
});
