// Raw JSON-RPC checks of the 2026-07-28 per-request rules and the legacy handshake, no SDK in between.
import { MODERN_VERSION, firstText, loadConfig, reporter } from "./lib.mjs";

const VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const CAPS_KEY = "io.modelcontextprotocol/clientCapabilities";
const SERVER_INFO_KEY = "io.modelcontextprotocol/serverInfo";
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_VERSION = -32022;
const INVALID_PARAMS = -32602;

const r = reporter("protocol");
const cfg = loadConfig();
let nextId = 1;

/** POSTs one frame; modern frames get _meta and matching headers unless overridden. */
async function rpc(method, params = {}, { modern = true, version = MODERN_VERSION, caps = {}, headers = {}, name } = {}) {
  const body = { jsonrpc: "2.0", id: nextId++, method, params: { ...params } };
  const h = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...cfg.authHeaders };
  if (modern) {
    body.params._meta = { [VERSION_KEY]: version };
    if (caps !== null) body.params._meta[CAPS_KEY] = caps;
    h["MCP-Protocol-Version"] = version;
    h["Mcp-Method"] = method;
    const target = name ?? params.name ?? params.uri;
    if (target !== undefined) h["Mcp-Name"] = target;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (v === null) delete h[k];
    else h[k] = v;
  }
  const res = await fetch(cfg.url, { method: "POST", headers: h, body: JSON.stringify(body) });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, result: json.result, error: json.error };
}

const describeArgs = { name: "stirling_describe_operation", arguments: { operation: "rotate-pdf" } };

async function modernHappyPath() {
  const discover = await rpc("server/discover");
  const versions = discover.result?.supportedVersions ?? [];
  r.check("server/discover lists 2026-07-28 first", discover.status === 200 && versions[0] === MODERN_VERSION, versions.join(","));
  r.check("server/discover still lists legacy versions", versions.includes("2025-06-18") && versions.includes("2025-11-25"));
  r.check("modern results carry resultType=complete", discover.result?.resultType === "complete");
  r.check("modern results carry serverInfo in _meta", discover.result?._meta?.[SERVER_INFO_KEY]?.name === "stirling-pdf-mcp");

  const list = await rpc("tools/list");
  r.check("tools/list carries private cache hints", list.result?.ttlMs > 0 && list.result?.cacheScope === "private", `ttlMs=${list.result?.ttlMs} cacheScope=${list.result?.cacheScope}`);

  const call = await rpc("tools/call", describeArgs);
  r.check("tools/call with matching headers", call.status === 200 && !call.result?.isError, firstText(call.result).slice(0, 100));

  const encoded = `=?base64?${Buffer.from(describeArgs.name).toString("base64")}?=`;
  const sentinel = await rpc("tools/call", describeArgs, { name: encoded });
  r.check("Mcp-Name accepts the =?base64?...?= form", sentinel.status === 200 && !sentinel.result?.isError, JSON.stringify(sentinel.error ?? {}));
}

async function modernRejections() {
  const expectError = async (label, res, code, httpStatus = 400) =>
    r.check(label, res.status === httpStatus && res.error?.code === code, `HTTP ${res.status} ${JSON.stringify(res.error)}`);

  await expectError("Mcp-Name mismatch is rejected", await rpc("tools/call", describeArgs, { name: "stirling_pages" }), HEADER_MISMATCH);
  await expectError("missing Mcp-Method is rejected", await rpc("tools/list", {}, { headers: { "Mcp-Method": null } }), HEADER_MISMATCH);
  await expectError("Mcp-Method mismatch is rejected", await rpc("tools/list", {}, { headers: { "Mcp-Method": "resources/list" } }), HEADER_MISMATCH);
  await expectError("header and _meta version mismatch is rejected", await rpc("tools/list", {}, { headers: { "MCP-Protocol-Version": "2025-06-18" } }), HEADER_MISMATCH);

  const unsupported = await rpc("tools/list", {}, { version: "2099-01-01" });
  await expectError("unknown protocol version is rejected", unsupported, UNSUPPORTED_VERSION);
  r.check("unsupported-version error lists what is supported", unsupported.error?.data?.supported?.includes(MODERN_VERSION), JSON.stringify(unsupported.error?.data));

  await expectError("missing clientCapabilities is invalid params", await rpc("tools/list", {}, { caps: null }), INVALID_PARAMS);
  await expectError("initialize is not a 2026-07-28 method", await rpc("initialize", {}), -32601, 404);
  await expectError("unknown resource is invalid params on 2026-07-28", await rpc("resources/read", { uri: "ui://stirling-pdf/missing.html" }), INVALID_PARAMS, 200);
}

async function mrtrRaw() {
  const caps = { elicitation: { form: {} } };
  const args = { name: "stirling_security", arguments: { operation: "add-password", file: cfg.pdfBase64, fileName: "mrtr.pdf", parameters: {} } };
  const first = await rpc("tools/call", args, { caps });
  const request = first.result?.inputRequests?.stirling_passwords;
  r.check("password op asks for input_required", first.result?.resultType === "input_required" && request?.method === "elicitation/create", JSON.stringify(first.result).slice(0, 160));
  r.check("form asks for the password field", request?.params?.requestedSchema?.properties?.password?.type === "string");
  const retry = await rpc("tools/call", { ...args, inputResponses: { stirling_passwords: { action: "accept", content: { password: `raw-${Date.now()}` } } } }, { caps });
  r.check("retry with the answer completes", retry.result?.resultType === "complete" && !retry.result?.isError, firstText(retry.result).slice(0, 120));
}

async function legacy() {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "conformance", version: "1" } }, { modern: false });
  r.check("legacy initialize echoes 2025-06-18", init.result?.protocolVersion === "2025-06-18", init.result?.protocolVersion);
  const fallback = await rpc("initialize", { protocolVersion: "1999-01-01", capabilities: {}, clientInfo: { name: "conformance", version: "1" } }, { modern: false });
  r.check("legacy initialize falls back for unknown versions", fallback.result?.protocolVersion === "2025-06-18", fallback.result?.protocolVersion);
  const list = await rpc("tools/list", {}, { modern: false });
  r.check("legacy tools/list has no modern decoration", Array.isArray(list.result?.tools) && list.result?.resultType === undefined);
  const missing = await rpc("resources/read", { uri: "ui://stirling-pdf/missing.html" }, { modern: false });
  r.check("unknown resource is -32002 on legacy", missing.error?.code === -32002, JSON.stringify(missing.error));
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...cfg.authHeaders },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  r.check("notifications are accepted with 202", res.status === 202, `HTTP ${res.status}`);
}

async function unauthenticated() {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  r.check("no credentials -> 401", res.status === 401, `HTTP ${res.status}`);
}

try {
  await unauthenticated();
  await modernHappyPath();
  await modernRejections();
  await mrtrRaw();
  await legacy();
  r.finish();
} catch (e) {
  r.crash(e);
}
