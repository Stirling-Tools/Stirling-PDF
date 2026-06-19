/**
 * Single-origin dev server for testing unified auth locally.
 *
 * The editor and portal store their session as a `stirling_jwt` token in
 * localStorage, which the browser scopes per origin. On separate dev ports they
 * can't share it; this server fronts both apps plus the backend on ONE origin
 * so a token from one app is automatically seen by the other - mirroring the
 * real same-origin production topology.
 *
 * Routing (single port):
 *   /api, /oauth2, /saml2, /v1/api-docs   -> reverse-proxy to the backend
 *   /portal, /portal/*                    -> the portal app
 *   everything else                       -> the editor app (SPA)
 *
 * Each app is served either from a production build (static files) or from a
 * running Vite dev server, chosen per app:
 *   - EDITOR_DEV_URL / PORTAL_DEV_URL set -> reverse-proxy to that dev server.
 *   - otherwise serve EDITOR_DIST / PORTAL_DIST as static files (SPA fallback).
 *
 * Vite HMR websockets connect straight to each dev server's own port, so live
 * mode keeps hot reload without this proxy needing to multiplex HMR sockets.
 *
 * Config via env: PORT, BACKEND_URL, EDITOR_DEV_URL, PORTAL_DEV_URL,
 * EDITOR_DIST, PORTAL_DIST.
 */
import http from "node:http";
import https from "node:https";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Duplex } from "node:stream";

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(here, "..");

const PORT = Number(process.env.PORT || 3000);
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const EDITOR_DEV_URL = process.env.EDITOR_DEV_URL || "";
const PORTAL_DEV_URL = process.env.PORTAL_DEV_URL || "";
const EDITOR_DIST = path.resolve(
  process.env.EDITOR_DIST || path.join(FRONTEND, "editor", "dist"),
);
const PORTAL_DIST = path.resolve(
  process.env.PORTAL_DIST || path.join(FRONTEND, "dist-portal"),
);

const backend = new URL(BACKEND_URL);
const editorDev = EDITOR_DEV_URL ? new URL(EDITOR_DEV_URL) : null;
const portalDev = PORTAL_DEV_URL ? new URL(PORTAL_DEV_URL) : null;

// Paths owned by the backend (mirrors the editor/portal Vite dev proxies).
const API_PREFIXES = ["/api", "/oauth2", "/saml2", "/v1/api-docs"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
};

function isApiPath(pathname: string): boolean {
  return API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function clientFor(target: URL): typeof http | typeof https {
  return target.protocol === "https:" ? https : http;
}

function proxyHttp(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  target: URL,
  label: string,
): void {
  const upstream = clientFor(target).request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    },
  );
  upstream.on("error", (err: Error) => {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`${label} not reachable at ${target.origin}: ${err.message}`);
  });
  req.pipe(upstream);
}

async function serveStatic(
  distDir: string,
  urlPath: string,
  res: http.ServerResponse,
): Promise<void> {
  const pathname = decodeURIComponent((urlPath.split("?")[0] || "/").trim());
  const hasExtension = path.extname(pathname) !== "";
  // Routes (no file extension) and "/" fall back to index.html so the SPA
  // router can take over; real assets resolve to their file.
  const candidate = hasExtension
    ? path.join(distDir, pathname)
    : path.join(distDir, "index.html");
  const resolved = path.resolve(candidate);

  // Path-traversal guard.
  if (resolved !== distDir && !resolved.startsWith(distDir + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(resolved);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(
      hasExtension
        ? "Not found"
        : `index.html not found in ${distDir}. Did the build run? (task dev:portal:proxy builds first)`,
    );
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(resolved).pipe(res);
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || "/").split("?")[0];

  if (isApiPath(pathname)) {
    proxyHttp(req, res, backend, "Backend");
    return;
  }
  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    if (portalDev) {
      // Dev server is served under the /portal base, so keep the full path.
      proxyHttp(req, res, portalDev, "Portal dev server");
    } else {
      const rest = (req.url || "").slice("/portal".length) || "/";
      void serveStatic(PORTAL_DIST, rest, res);
    }
    return;
  }
  if (editorDev) {
    proxyHttp(req, res, editorDev, "Editor dev server");
  } else {
    void serveStatic(EDITOR_DIST, req.url || "/", res);
  }
});

// Forward websocket upgrades to the matching upstream. Backend streaming
// endpoints need /api; the dev servers' HMR sockets connect directly to their
// own ports, but routing them here too keeps things working if a browser sends
// them through the proxy.
function proxyUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
  target: URL,
): void {
  const upstream = clientFor(target).request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: target.host },
  });
  upstream.on("upgrade", (upRes, upSocket, upHead) => {
    const headerLines = Object.entries(upRes.headers).map(
      ([k, v]) => `${k}: ${v as string}`,
    );
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${headerLines.join("\r\n")}\r\n\r\n`,
    );
    if (upHead && upHead.length) upSocket.unshift(upHead);
    if (head && head.length) upSocket.write(head);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
    upSocket.on("error", () => socket.destroy());
    socket.on("error", () => upSocket.destroy());
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
}

server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url || "/").split("?")[0];
  if (isApiPath(pathname)) {
    proxyUpgrade(req, socket, head, backend);
  } else if (
    portalDev &&
    (pathname === "/portal" || pathname.startsWith("/portal/"))
  ) {
    proxyUpgrade(req, socket, head, portalDev);
  } else if (editorDev) {
    proxyUpgrade(req, socket, head, editorDev);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  const editorSrc = editorDev ? `${editorDev.origin} (dev)` : EDITOR_DIST;
  const portalSrc = portalDev ? `${portalDev.origin} (dev)` : PORTAL_DIST;
  console.log("");
  console.log("  Unified-auth single-origin server");
  console.log(`  ▶ open      http://localhost:${PORT}/         (editor)`);
  console.log(`  ▶ open      http://localhost:${PORT}/portal    (portal)`);
  console.log(`  ▶ backend   ${BACKEND_URL}  (proxying /api, /oauth2, /saml2)`);
  console.log(`  ▶ editor    ${editorSrc}`);
  console.log(`  ▶ portal    ${portalSrc}`);
  console.log(
    "  Log into one, open the other - the stirling_jwt token is shared (same origin).",
  );
  console.log("");
});
