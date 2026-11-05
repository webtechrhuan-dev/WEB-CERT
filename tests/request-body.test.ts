import { describe, expect, it } from "vitest";
import { readBodyBytes, readJsonBody } from "@/lib/server/request-body";

describe("readJsonBody", () => {
  it("parses valid JSON", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { Cliente: "Teste" } }),
    });
    await expect(readJsonBody(request)).resolves.toEqual({ values: { Cliente: "Teste" } });
  });

  it("rejects malformed JSON with a client error", async () => {
    const request = new Request("https://example.test/api", { method: "POST", body: "{" });
    await expect(readJsonBody(request)).rejects.toMatchObject({ code: "MALFORMED_JSON" });
  });

  it("enforces the byte limit even without Content-Length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"123456789"}'));
        controller.close();
      },
    });
    const request = new Request("https://example.test/api", { method: "POST", body, duplex: "half" } as RequestInit);
    await expect(readJsonBody(request, 8)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects non-object JSON payloads", async () => {
    const request = new Request("https://example.test/api", { method: "POST", body: "[]" });
    await expect(readJsonBody(request)).rejects.toMatchObject({ code: "MALFORMED_JSON" });
  });

  it("limits multipart bytes without relying on Content-Length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(12));
        controller.close();
      },
    });
    const request = new Request("https://example.test/upload", { method: "POST", body, duplex: "half" } as RequestInit);
    await expect(readBodyBytes(request, 10)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});
