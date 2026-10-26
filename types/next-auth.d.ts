import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      login: string;
      role: "viewer" | "editor";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubLogin?: string;
  }
}
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: "viewer" | "editor";
    } & DefaultSession["user"];
  }
}
