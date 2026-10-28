import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getMongoDb } from "@/lib/server/mongodb";

type AppRole = "admin" | "editor";
type UserDocument = {
  username: string;
  displayName: string;
  role: AppRole;
  salt: string;
  passwordHash: string;
};

const initialUsers: Array<{ username: string; displayName: string; role: AppRole }> = [
  { username: "rhuan", displayName: "Rhuan", role: "admin" },
  { username: "arthur", displayName: "Arthur", role: "editor" },
  { username: "wesley", displayName: "Wesley", role: "editor" },
];

function passwordHash(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

async function ensureInitialUsers(): Promise<void> {
  const db = await getMongoDb();
  const users = db.collection<UserDocument>("users");
  await users.createIndex({ username: 1 }, { unique: true });
  for (const user of initialUsers) {
    const salt = randomBytes(16).toString("hex");
    await users.updateOne(
      { username: user.username },
      {
        $setOnInsert: {
          ...user,
          salt,
          passwordHash: passwordHash("12345678", salt),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
}

export const authConfigured = Boolean(process.env.AUTH_SECRET && process.env.MONGODB_URI);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      id: "credentials",
      name: "Usuário e senha",
      credentials: {
        username: { label: "Usuário", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!authConfigured) return null;
        const username = String(credentials?.username ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!username || !password || username.length > 80 || password.length > 200) return null;

        await ensureInitialUsers();
        const db = await getMongoDb();
        const user = await db.collection<UserDocument>("users").findOne({ username });
        if (!user) return null;

        const candidate = Buffer.from(passwordHash(password, user.salt), "hex");
        const expected = Buffer.from(user.passwordHash, "hex");
        if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return null;

        return {
          id: user.username,
          name: user.displayName,
          login: user.username,
          role: user.role,
        };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.login = "login" in user && typeof user.login === "string" ? user.login : user.id;
        token.role = "role" in user && (user.role === "admin" || user.role === "editor") ? user.role : "editor";
      }
      return token;
    },
    async session({ session, token }) {
      const login = typeof token.login === "string" ? token.login : "";
      const role = token.role === "admin" || token.role === "editor" ? token.role : "editor";
      if (session.user) {
        session.user.login = login;
        session.user.role = role;
        session.user.name = login ? login.charAt(0).toUpperCase() + login.slice(1) : "Usuário";
      }
      return session;
    },
  },
});
