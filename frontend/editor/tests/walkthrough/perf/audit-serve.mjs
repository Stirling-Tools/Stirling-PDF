/**
 * Static server for `frontend/editor/dist` that behaves like the deployed
 * deployment: precompressed siblings are served with their `Content-Encoding`,
 * compressible types are gzipped on the fly, hashed assets are immutable, and
 * `/api/*` is proxied to the stub backend. `vite preview` serves everything
 * uncompressed, which misprices every audit.
 *
 * Usage: node tests/walkthrough/perf/audit-serve.mjs [port] [backendPort]
 */
import { createServer, request as httpRequest } from "node:http";
import { promisify } from "node:util";
import { gzip as gzipCb } from "node:zlib";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const gzip = promisify(gzipCb);
const port = Number(process.argv[2] ?? 4180);
const backendPort = Number(process.argv[3] ?? 8080);
const root = resolve(import.meta.dirname, "../../../dist");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".bin": "application/octet-stream",
};
const COMPRESSIBLE = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".toml",
  ".map",
  ".svg",
  ".txt",
]);
const CACHE = new Map();

/** Resolve a request path to a file in `dist`, with SPA fallback to index.html. */
function locate(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0]));
  const direct = join(root, clean);
  if (!direct.startsWith(root)) return null;
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  if (existsSync(direct) && statSync(direct).isDirectory()) {
    const index = join(direct, "index.html");
    if (existsSync(index)) return index;
  }
  if (!extname(clean)) return join(root, "index.html");
  return null;
}

async function negotiate(file, acceptEncoding) {
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  if (!COMPRESSIBLE.has(extname(file)))
    return { body: file, encoding: null, type };
  if (acceptEncoding.includes("br") && existsSync(`${file}.br`))
    return { body: `${file}.br`, encoding: "br", type };
  if (/gzip/.test(acceptEncoding) && existsSync(`${file}.gz`))
    return { body: `${file}.gz`, encoding: "gzip", type };
  if (!/gzip/.test(acceptEncoding)) return { body: file, encoding: null, type };
  let compressed = CACHE.get(file);
  if (!compressed) {
    compressed = await gzip(await readFile(file));
    CACHE.set(file, compressed);
  }
  return { body: compressed, encoding: "gzip", type };
}

const server = createServer((req, res) => {
  void (async () => {
    if (req.url?.startsWith("/api/")) {
      const proxied = httpRequest(
        { host: "127.0.0.1", port: backendPort, path: req.url, method: req.method, headers: req.headers },
        (upstream) => {
          res.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(res);
        },
      );
      proxied.on("error", () => {
        res.writeHead(502).end("stub backend down");
      });
      req.pipe(proxied);
      return;
    }
    const file = locate(req.url ?? "/");
    if (!file) {
      res.writeHead(404).end("not found");
      return;
    }
    const { body, encoding, type } = await negotiate(
      file,
      String(req.headers["accept-encoding"] ?? ""),
    );
    const immutable = /\/assets\/.*-[A-Za-z0-9_-]{8,}\./.test(file);
    const headers = {
      "content-type": type,
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      vary: "Accept-Encoding",
    };
    if (encoding) headers["content-encoding"] = encoding;
    res.writeHead(200, headers);
    if (Buffer.isBuffer(body)) res.end(body);
    else createReadStream(body).pipe(res);
  })().catch((error) => {
    res.writeHead(500).end(String(error));
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `audit server on http://127.0.0.1:${String(port)} serving ${root} (api -> 127.0.0.1:${String(backendPort)})\n`,
  );
});
