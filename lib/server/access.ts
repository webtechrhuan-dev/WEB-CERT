import "server-only";

import { auth, authConfigured, isAllowedEmail } from "@/auth";

export type UserRole = "viewer" | "editor";

export type AccessContext = {
  email: string;
  role: UserRole;
};

export type AccessErrorCode =
  | "AUTH_NOT_CONFIGURED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN";

export class AccessError extends Error {
  constructor(public readonly code: AccessErrorCode) {
    super("Acesso não autorizado.");
    this.name = "AccessError";
  }
}

export async function requireAccess(
  minimumRole: UserRole = "viewer",
): Promise<AccessContext> {
  if (!authConfigured) {
    throw new AccessError("AUTH_NOT_CONFIGURED");
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAllowedEmail(email)) {
    throw new AccessError("UNAUTHENTICATED");
  }

  const role = session.user.role;
  if (minimumRole === "editor" && role !== "editor") {
    throw new AccessError("FORBIDDEN");
  }

  return { email, role };
}
