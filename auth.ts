import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const allowedGitHubLogins = new Set(
  (process.env.AUTH_ALLOWED_GITHUB_LOGINS ?? "")
    .split(",")
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean),
);
const editorGitHubLogins = new Set(
  (process.env.AUTH_EDITOR_GITHUB_LOGINS ?? "")
    .split(",")
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean),
);

export const authConfigured = Boolean(
  process.env.AUTH_SECRET &&
    process.env.AUTH_GITHUB_ID &&
    process.env.AUTH_GITHUB_SECRET &&
    allowedGitHubLogins.size > 0,
);

export function isAllowedGitHubLogin(login: string): boolean {
  return allowedGitHubLogins.has(login.toLowerCase());
}

function getProfileLogin(profile: unknown): string | null {
  if (typeof profile !== "object" || profile === null) {
    return null;
  }

  return "login" in profile && typeof profile.login === "string"
    ? profile.login.toLowerCase()
    : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: authConfigured
    ? [GitHub]
    : [],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      const login = getProfileLogin(profile);
      return authConfigured && login !== null && allowedGitHubLogins.has(login);
    },
    async jwt({ token, profile }) {
      if (profile) {
        const login = getProfileLogin(profile);
        if (login) {
          token.githubLogin = login;
        }
      }
      return token;
    },
    async session({ session, token }) {
      const login = typeof token.githubLogin === "string" ? token.githubLogin : null;
      if (session.user && login) {
        session.user.login = login;
        session.user.role =
          allowedGitHubLogins.has(login) && editorGitHubLogins.has(login)
            ? "editor"
            : "viewer";
      }
      return session;
    },
  },
});
