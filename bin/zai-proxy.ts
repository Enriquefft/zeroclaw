#!/usr/bin/env bun
/**
 * Z.AI Tool Stream Proxy
 *
 * Transparent HTTP proxy that injects `tool_stream: true` into all
 * Z.AI API request bodies. GLM-5 requires this proprietary parameter
 * to reliably generate tool calls — without it, tool call responses
 * are malformed or absent.
 *
 * Usage:
 *   bun run /etc/nixos/zeroclaw/bin/zai-proxy.ts [--port 5100]
 *
 * Then point ZeroClaw's base_url to http://127.0.0.1:5100/api/coding/paas/v4
 */

const UPSTREAM = "https://api.z.ai";
const DEFAULT_PORT = 5100;

const port = (() => {
  const idx = process.argv.indexOf("--port");
  if (idx !== -1 && process.argv[idx + 1]) {
    const p = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(p)) return p;
  }
  return DEFAULT_PORT;
})();

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
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

      const resp = await fetch(upstream, {
        method: "POST",
        headers,
        body: forwardBody,
      });

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
      });
    }

    // Pass through non-POST requests unchanged
    const resp = await fetch(upstream, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    });

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    });
  },
});

console.error(`[zai-proxy] Listening on http://127.0.0.1:${server.port}`);
console.error(`[zai-proxy] Upstream: ${UPSTREAM}`);
console.error(`[zai-proxy] Injecting tool_stream=true into all tool-bearing requests`);
