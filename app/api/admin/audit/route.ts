import { ObjectId } from "mongodb";
import { requireAccess } from "@/lib/server/access";
import { apiErrorResponse } from "@/lib/server/api-errors";
import { getMongoDb } from "@/lib/server/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAccess("admin");
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
    const rawCursor = url.searchParams.get("cursor");
    if (rawCursor && !ObjectId.isValid(rawCursor)) {
      return Response.json({ error: { code: "INVALID_CURSOR", message: "Cursor de auditoria inválido." } }, { status: 400 });
    }

    const db = await getMongoDb();
    const filter = rawCursor ? { _id: { $lt: new ObjectId(rawCursor) } } : {};
    const events = await db.collection("audit_events")
      .find(filter, {
        projection: {
          actor: 1,
          action: 1,
          entity: 1,
          entityId: 1,
          occurredAt: 1,
          outcome: 1,
          metadata: 1,
        },
      })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .toArray();

    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;
    return Response.json({
      events: page.map((event) => ({
        id: String(event._id),
        actor: event.actor,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId,
        occurredAt: event.occurredAt,
        outcome: event.outcome,
        metadata: event.metadata ?? {},
      })),
      nextCursor: hasMore ? String(page[page.length - 1]._id) : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "api/admin/audit");
  }
}
