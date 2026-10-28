import "server-only";

import { auth } from "@/auth";

export type UserRole = "viewer" | "editor" | "admin";

export type AccessContext = {
  login: string;
  role: UserRole;
};

export type AccessErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";

export class AccessError extends Error {
  constructor(public readonly code: AccessErrorCode) {
    super("Acesso não autorizado.");
    this.name = "AccessError";
  }
}

export async function requireAccess(minimumRole: UserRole = "viewer"): Promise<AccessContext> {
  const session = await auth();
  const login = session?.user?.login;
  const role = session?.user?.role;
  if (!login || (role !== "admin" && role !== "editor" && role !== "viewer")) {
    throw new AccessError("UNAUTHENTICATED");
  }
  if (minimumRole === "admin" && role !== "admin") {
    throw new AccessError("FORBIDDEN");
  }
  if (minimumRole === "editor" && role !== "editor" && role !== "admin") {
    throw new AccessError("FORBIDDEN");
  }
  return { login, role };
}
