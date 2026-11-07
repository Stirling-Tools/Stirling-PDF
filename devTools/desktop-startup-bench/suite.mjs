// Boot one backend, then call every file-taking PDF endpoint from its OpenAPI spec, one at a time.
// usage: node suite.mjs <label> <java> <jar> <dataDir> <out.json> [jvm opts...]
// Run it against two backends, then diff the outputs with compare.mjs.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [label, java, jar, dataDirArg, out, ...extra] = process.argv.slice(2);
const here = import.meta.dirname;
const repo = path.join(here, "../..");
const pdf = fs.readFileSync(`${repo}/app/core/src/test/resources/pdftexteditor/mushroom-life.pdf`);
const p12 = fs.readFileSync(`${repo}/app/core/src/test/resources/certs/test-cert.p12`);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const ALLOW = /^\/api\/v1\/(general|security|convert|misc|filter)\//;
const DENY = /url|email|eml|webhook|send|pipeline|ai-|\/ai\/|mcp|stream|session|batch|async/i;

const dataDir = path.resolve(dataDirArg);
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(path.join(dataDir, "configs"), { recursive: true });
const stop = path.join(dataDir, ".backend-stop-suite");
const child = spawn(java, ["-Xmx2g", "-DBROWSER_OPEN=false", "-DSTIRLING_PDF_TAURI_MODE=true", "-Dserver.port=0",
  "-Dserver.forward-headers-strategy=none", "-Dsecurity.enableLogin=false", "-Dsecurity.csrfDisabled=true", ...extra, "-jar", jar],
  { cwd: dataDir, env: { ...process.env, TAURI_PARENT_PID: String(process.pid), STIRLING_PDF_CONFIG_DIR: path.join(dataDir, "configs"),
    STIRLING_PDF_WORK_DIR: dataDir, STIRLING_PDF_SHUTDOWN_FILE: stop }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
const port = await new Promise((res, rej) => {
  const on = (d) => { log += d; const m = log.match(/running on port: (\d+)/); if (m) res(m[1]); };
  child.stdout.on("data", on); child.stderr.on("data", on);
  child.on("exit", (c) => rej(new Error(`exited ${c}\n${log.slice(-3000)}`)));
});
const base = `http://127.0.0.1:${port}`;
for (;;) { try { const r = await fetch(`${base}/api/v1/config/app-config`); if ((await r.json()).dependenciesReady) break; } catch {} await new Promise((s) => setTimeout(s, 100)); }

const spec = await (await fetch(`${base}/v1/api-docs`)).json();
const deref = (s) => (s && s.$ref ? deref(spec.components.schemas[s.$ref.split("/").pop()]) : s || {});
const blob = (buf, type, name) => [new Blob([buf], { type }), name];
function fileFor(name) {
  if (/p12|pfx|keystore|cert/i.test(name)) return blob(p12, "application/x-pkcs12", "test-cert.p12");
  if (/image|img|png|stamp|logo|signature/i.test(name)) return blob(png, "image/png", "a.png");
  return blob(pdf, "application/pdf", "in.pdf");
}
function scalar(name, s) {
  if (s.default !== undefined) return s.default;
  if (s.example !== undefined) return s.example;
  if (s.enum) return s.enum[0];
  if (s.type === "boolean") return false;
  if (s.type === "integer" || s.type === "number") return s.minimum ?? 1;
  if (/page/i.test(name)) return "1";
  if (/password/i.test(name)) return "password";
  return "1";
}
const overrides = { "/api/v1/security/cert-sign": { certType: "PKCS12", password: "password" } };

const results = {};
const call = async (p, fd) => {
  const t = performance.now();
  try {
    const r = await fetch(base + p, { method: "POST", body: fd, signal: AbortSignal.timeout(90000) });
    const b = Buffer.from(await r.arrayBuffer());
    return { status: r.status, ct: (r.headers.get("content-type") || "").split(";")[0], len: b.length, ms: Math.round(performance.now() - t), body: b };
  } catch (e) { return { status: "ERR " + e.name, ms: Math.round(performance.now() - t) }; }
};
for (const [p, ops] of Object.entries(spec.paths)) {
  const op = ops.post;
  if (!op || !ALLOW.test(p) || DENY.test(p)) continue;
  const schema = deref(op.requestBody?.content?.["multipart/form-data"]?.schema);
  if (!schema.properties) continue;
  const props = Object.entries(schema.properties).map(([k, v]) => [k, deref(v)]);
  if (!props.some(([, v]) => v.format === "binary" || v.items?.format === "binary")) continue;
  const req = new Set(schema.required || []);
  const fd = new FormData();
  for (const [k, v] of props) {
    if (v.format === "binary") { if (k === "fileInput" || req.has(k) || /p12/i.test(k)) fd.append(k, ...fileFor(k)); continue; }
    if (v.items?.format === "binary") { fd.append(k, ...fileFor(k)); fd.append(k, ...fileFor(k)); continue; }
    const o = overrides[p]?.[k];
    if (o !== undefined) { fd.append(k, o); continue; }
    if (req.has(k) || v.default !== undefined) fd.append(k, String(scalar(k, v)));
  }
  const r = await call(p, fd);
  if (p === "/api/v1/security/cert-sign" && r.status === 200) {
    const v = new FormData(); v.append("fileInput", ...blob(r.body, "application/pdf", "signed.pdf"));
    const vr = await call("/api/v1/security/validate-signature", v);
    results["CHAIN cert-sign -> validate-signature"] = { status: vr.status, ct: vr.ct, len: vr.len, body: vr.body?.toString().slice(0, 600) };
  }
  delete r.body;
  results[p] = r;
  process.stdout.write(`${r.status} ${p}\n`);
}
fs.writeFileSync(out, JSON.stringify({ label, results }, null, 1));
fs.writeFileSync(stop, "x");
setTimeout(() => {
  try { process.platform === "win32" ? execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore" }) : process.kill(child.pid, "SIGKILL"); } catch {}
  process.exit(0);
}, 15000).unref();
child.on("exit", () => process.exit(0));
