import "server-only";

import { auth } from "@/auth";
import { getMongoDb } from "@/lib/server/mongodb";

export type UserRole = "viewer" | "editor" | "admin";

export type AccessContext = {
  login: string;
  role: UserRole;
};

export type AccessErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";

type AccessUser = {
  username: string;
  role: UserRole;
  active?: boolean;
};

export class AccessError extends Error {
  constructor(public readonly code: AccessErrorCode) {
    super("Acesso interno não autorizado.");
    this.name = "AccessError";
  }
}

/**
 * Revalida a conta e a função no banco em cada operação protegida.
 * O JWT identifica a sessão, mas não é a fonte de verdade para permissões:
 * alterações de função ou desativações passam a valer sem esperar o token expirar.
 * Contas legadas sem o campo active continuam ativas por compatibilidade.
 */
export async function requireAccess(minimumRole: UserRole = "viewer"): Promise<AccessContext> {
  const session = await auth();
  const login = session?.user?.login?.trim().toLowerCase();
  if (!login) throw new AccessError("UNAUTHENTICATED");

  const db = await getMongoDb();
  const user = await db.collection<AccessUser>("users").findOne(
    { username: login },
    { projection: { username: 1, role: 1, active: 1 } },
  );

  if (!user || user.active === false) throw new AccessError("UNAUTHENTICATED");
  if (user.role !== "admin" && user.role !== "editor" && user.role !== "viewer") {
    throw new AccessError("UNAUTHENTICATED");
  }

  if (minimumRole === "admin" && user.role !== "admin") {
    throw new AccessError("FORBIDDEN");
  }
  if (minimumRole === "editor" && user.role !== "editor" && user.role !== "admin") {
    throw new AccessError("FORBIDDEN");
  }

  return { login: user.username, role: user.role };
}
