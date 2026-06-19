/**
 * Single-origin dev server for testing unified auth locally.
 *
 * The editor and portal store their session as a `stirling_jwt` token in
 * localStorage, which the browser scopes per origin. On separate dev ports they
 * can't share it; this server fronts both production builds plus the backend on
 * ONE origin so a token from one app is automatically seen by the other -
 * mirroring the real same-origin production topology.
 *
 * Routing (single port):
 *   /api, /oauth2, /saml2, /v1/api-docs   -> reverse-proxy to the backend
 *   /portal, /portal/*                    -> static from the portal build
 *   everything else                       -> static from the editor build (SPA)
 *
 * Config via env: PORT, BACKEND_URL, EDITOR_DIST, PORTAL_DIST.
 *
 * This serves *builds*, not dev servers, so there is no hot reload - rebuild to
 * see changes. That's intentional: it keeps the proxy free of Vite HMR
 * websocket plumbing and matches how production serves both apps.
 */
import http from "node:http";
import https from "node:https";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(here, "..");

const PORT = Number(process.env.PORT || 3000);
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const EDITOR_DIST = path.resolve(
  process.env.EDITOR_DIST || path.join(FRONTEND, "editor", "dist"),
);
const PORTAL_DIST = path.resolve(
  process.env.PORTAL_DIST || path.join(FRONTEND, "dist-portal"),
);

const backend = new URL(BACKEND_URL);
const backendClient = backend.protocol === "https:" ? https : http;

// Paths owned by the backend (mirrors the editor/portal Vite dev proxies).
const API_PREFIXES = ["/api", "/oauth2", "/saml2", "/v1/api-docs"];

const MIME = {
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

function isApiPath(pathname) {
  return API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function proxyToBackend(req, res) {
  const options = {
    protocol: backend.protocol,
    hostname: backend.hostname,
    port: backend.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: backend.host },
  };
  const upstream = backendClient.request(options, (upRes) => {
    res.writeHead(upRes.statusCode || 502, upRes.headers);
    upRes.pipe(res);
  });
  upstream.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Backend not reachable at ${BACKEND_URL}: ${err.message}`);
  });
  req.pipe(upstream);
}

async function serveStatic(distDir, urlPath, res) {
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
    if (hasExtension) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(
        `index.html not found in ${distDir}. Did the build run? (task dev:portal:proxy builds first)`,
      );
    }
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
    proxyToBackend(req, res);
    return;
  }
  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    const rest = req.url.slice("/portal".length) || "/";
    void serveStatic(PORTAL_DIST, rest, res);
    return;
  }
  void serveStatic(EDITOR_DIST, req.url, res);
});

// Forward backend WebSocket upgrades (e.g. live/streaming endpoints); the
// static builds have no websockets of their own.
server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url || "/").split("?")[0];
  if (!isApiPath(pathname)) {
    socket.destroy();
    return;
  }
  const upstream = backendClient.request({
    protocol: backend.protocol,
    hostname: backend.hostname,
    port: backend.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: backend.host },
  });
  upstream.on("upgrade", (upRes, upSocket, upHead) => {
    const headerLines = Object.entries(upRes.headers).map(
      ([k, v]) => `${k}: ${v}`,
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
});

server.listen(PORT, () => {
  console.log("");
  console.log("  Unified-auth single-origin server");
  console.log(`  ▶ open      http://localhost:${PORT}/         (editor)`);
  console.log(`  ▶ open      http://localhost:${PORT}/portal    (portal)`);
  console.log(`  ▶ backend   ${BACKEND_URL}  (proxying /api, /oauth2, /saml2)`);
  console.log(`  ▶ editor    ${EDITOR_DIST}`);
  console.log(`  ▶ portal    ${PORTAL_DIST}`);
  console.log(
    "  Log into one, open the other - the stirling_jwt token is shared (same origin).",
  );
  console.log("");
});
