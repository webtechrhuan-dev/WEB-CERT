import "next-auth";
import "next-auth/jwt";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    login?: string;
    role?: "viewer" | "editor" | "admin";
  }
  interface Session {
    user: {
      login: string;
      role: "viewer" | "editor" | "admin";
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    login?: string;
    role?: "viewer" | "editor" | "admin";
  }
}
