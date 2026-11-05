import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { writeAuditEvent } from "@/lib/server/audit-log";
import { getMongoClient, getMongoDb } from "@/lib/server/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type ManagedUser = { username: string; displayName?: string; role: "admin" | "editor" | "viewer"; active?: boolean; createdAt?: Date; updatedAt?: Date };

export async function GET() {
  try {
    await requireAccess("admin");
    const db = await getMongoDb();
    const users = await db.collection<ManagedUser>("users").find({}, { projection: { username: 1, displayName: 1, role: 1, active: 1, createdAt: 1, updatedAt: 1 } }).sort({ username: 1 }).toArray();
    return Response.json({ users: users.map(({ username, displayName, role, active, createdAt, updatedAt }) => ({ username, displayName: displayName ?? username, role, active: active !== false, createdAt: createdAt ?? null, updatedAt: updatedAt ?? null })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "api/admin/users"); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAccess("admin");
    const body = await request.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const role = body?.role;
    const active = body?.active;
    if (!/^[a-z0-9._-]{2,80}$/.test(username) || (role !== undefined && !["admin", "editor", "viewer"].includes(role)) || (active !== undefined && typeof active !== "boolean") || (role === undefined && active === undefined)) {
      return Response.json({ error: { code: "INVALID_INPUT", message: "Informe usuário e uma função ou situação válida." } }, { status: 400 });
    }
    if (username === actor.login) return Response.json({ error: { code: "SELF_MODIFICATION_BLOCKED", message: "Para evitar bloqueio administrativo, não é permitido alterar a própria conta por esta tela." } }, { status: 409 });
    const client = await getMongoClient();
    const session = client.startSession();
    let updatedUser: ManagedUser | null = null;
    try {
      await session.withTransaction(async () => {
        const db = client.db(process.env.MONGODB_DB ?? "web_cert");
        const users = db.collection<ManagedUser>("users");
        // Escrita em documento comum serializa alterações concorrentes de administradores.
        await db.collection("admin_guard").updateOne({ _id: "user-management" }, { $inc: { revision: 1 } }, { upsert: true, session });
        const target = await users.findOne({ username }, { session });
        if (!target) throw new Error("USER_NOT_FOUND");
        const nextRole = role ?? target.role;
        const nextActive = active ?? target.active !== false;
        if (target.role === "admin" && target.active !== false && (nextRole !== "admin" || !nextActive)) {
          const activeAdmins = await users.countDocuments({ role: "admin", active: { $ne: false } }, { session });
          if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
        }
        await users.updateOne({ username }, { $set: { role: nextRole, active: nextActive, updatedAt: new Date() } }, { session });
        updatedUser = { ...target, role: nextRole, active: nextActive };
      });
    } finally { await session.endSession(); }
    if (!updatedUser) throw new Error("USER_NOT_FOUND");
    const auditRecorded = await writeAuditEvent({ actor: actor.login, action: "user.updated", entity: "user", entityId: username, metadata: { role: updatedUser.role, active: updatedUser.active !== false } });
    return Response.json({ ok: true, user: { username, role: updatedUser.role, active: updatedUser.active !== false }, auditRecorded }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ADMIN") return Response.json({ error: { code: "LAST_ADMIN", message: "O sistema precisa manter pelo menos um administrador ativo." } }, { status: 409 });
    if (error instanceof Error && error.message === "USER_NOT_FOUND") return Response.json({ error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado." } }, { status: 404 });
    return apiErrorResponse(error, "api/admin/users");
  }
}
