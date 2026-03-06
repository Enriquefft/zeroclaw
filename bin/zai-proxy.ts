#!/usr/bin/env bun
/**
 * Z.AI Tool Stream Proxy
 *
 * Transparent HTTP proxy that injects `tool_stream: true` into all
 * Z.AI API request bodies. GLM-5 requires this proprietary parameter
 * to reliably generate tool calls — without it, tool call responses
 * are malformed or absent.
 *
 * Also enforces two guardrails:
 * - Rejects /responses requests (Z.AI only supports /chat/completions)
 * - 60-second upstream timeout to prevent indefinite hangs
 *
 * Usage:
 *   bun run /etc/nixos/zeroclaw/bin/zai-proxy.ts [--port 5100]
 *
 * Then point ZeroClaw's base_url to http://127.0.0.1:5100/api/coding/paas/v4
 */

const UPSTREAM = "https://api.z.ai";
const DEFAULT_PORT = 5100;
const UPSTREAM_TIMEOUT_MS = 60_000;

const port = (() => {
  const idx = process.argv.indexOf("--port");
  if (idx !== -1 && process.argv[idx + 1]) {
    const p = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(p)) return p;
  }
  return DEFAULT_PORT;
})();

function jsonError(status: number, message: string, code: string) {
  return new Response(
    JSON.stringify({ error: { message, type: "invalid_request_error", code } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);

    // Z.AI does not support the OpenAI Responses API — reject immediately
    // so zeroclaw falls back to chat_completions without waiting for a timeout.
    if (url.pathname.includes("/responses")) {
      console.error(`[zai-proxy] REJECTED ${req.method} ${url.pathname} — /responses not supported by Z.AI`);
      return jsonError(404, "Z.AI does not support the /responses endpoint. Use /chat/completions.", "unsupported_endpoint");
    }

    const upstream = `${UPSTREAM}${url.pathname}${url.search}`;

    console.error(`[zai-proxy] ${req.method} ${url.pathname}`);

    const headers = new Headers(req.headers);
    headers.delete("host");

    // For POST requests, clone body, parse, inject tool_stream, then forward
    if (req.method === "POST") {
      const rawBody = await req.text();
      let forwardBody = rawBody;

      try {
        const body = JSON.parse(rawBody);

        // Inject tool_stream: true if tools are present
        if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
          body.tool_stream = true;
          console.error(
            `[zai-proxy] Injected tool_stream=true for ${body.model ?? "unknown"} (${body.tools.length} tools)`
          );
        }

        forwardBody = JSON.stringify(body);
      } catch {
        // Not JSON — forward raw body as-is
      }

      try {
        const resp = await fetch(upstream, {
          method: "POST",
          headers,
          body: forwardBody,
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });

        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers: resp.headers,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "TimeoutError") {
          console.error(`[zai-proxy] TIMEOUT after ${UPSTREAM_TIMEOUT_MS / 1000}s for POST ${url.pathname}`);
          return jsonError(504, `Upstream Z.AI request timed out after ${UPSTREAM_TIMEOUT_MS / 1000} seconds`, "timeout");
        }
        throw err;
      }
    }

    // Pass through non-POST requests unchanged
    try {
      const resp = await fetch(upstream, {
        method: req.method,
        headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        console.error(`[zai-proxy] TIMEOUT after ${UPSTREAM_TIMEOUT_MS / 1000}s for ${req.method} ${url.pathname}`);
        return jsonError(504, `Upstream Z.AI request timed out after ${UPSTREAM_TIMEOUT_MS / 1000} seconds`, "timeout");
      }
      throw err;
    }
  },
});

console.error(`[zai-proxy] Listening on http://127.0.0.1:${server.port}`);
console.error(`[zai-proxy] Upstream: ${UPSTREAM}`);
console.error(`[zai-proxy] Injecting tool_stream=true into all tool-bearing requests`);
console.error(`[zai-proxy] Rejecting /responses requests (Z.AI only supports /chat/completions)`);
console.error(`[zai-proxy] Upstream timeout: ${UPSTREAM_TIMEOUT_MS / 1000}s`);
