import { authConfigured, handlers } from "@/auth";

export const GET = authConfigured

  ? handlers.GET
  : () => Response.json(null, { headers: { "Cache-Control": "no-store" } });
export const POST = authConfigured
  ? handlers.POST
  : () =>
      Response.json(
        { error: "A autenticação corporativa não está configurada." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
