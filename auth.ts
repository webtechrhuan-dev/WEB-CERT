import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const allowedEmails = new Set(
  (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const editorEmails = new Set(
  (process.env.AUTH_EDITOR_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const authConfigured = Boolean(
  process.env.AUTH_SECRET &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER &&
    allowedEmails.size > 0,
);

export function isAllowedEmail(email: string): boolean {
  return allowedEmails.has(email.toLowerCase());
}

function getProfileEmail(profile: unknown): string | null {
  if (typeof profile !== "object" || profile === null) {
    return null;
  }

  const email =
    "email" in profile && typeof profile.email === "string"
      ? profile.email
      : "preferred_username" in profile
        ? profile.preferred_username
        : null;

  return typeof email === "string" ? email.toLowerCase() : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: authConfigured
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
          issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!,
          authorization: { params: { scope: "openid profile email" } },
          profile(profile) {
            const email =
              typeof profile.email === "string"
                ? profile.email
                : typeof profile.preferred_username === "string"
                  ? profile.preferred_username
                  : null;
            return {
              id: profile.sub,
              name: profile.name,
              email,
            };
          },
        }),
      ]
    : [],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      const email = getProfileEmail(profile);
      return authConfigured && email !== null && allowedEmails.has(email);
    },
    async session({ session, token }) {
      const email = typeof token.email === "string" ? token.email.toLowerCase() : null;
      if (session.user && email) {
        session.user.email = email;
        session.user.role =
          allowedEmails.has(email) && editorEmails.has(email) ? "editor" : "viewer";
      }
      return session;
    },
  },
});
