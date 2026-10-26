import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: "viewer" | "editor";
    } & DefaultSession["user"];
  }
}
