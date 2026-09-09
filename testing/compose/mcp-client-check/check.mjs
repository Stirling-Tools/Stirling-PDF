/**
 * Real MCP client validation via the official @modelcontextprotocol/sdk over streamable HTTP.
 *
 * Auth header (non-interactive):
 *   MCP_BEARER=<jwt> -> Authorization: Bearer <jwt> (oauth)
 *   MCP_APIKEY=<key> -> X-API-KEY: <key> (apikey)
 * Env: MCP_URL (default http://localhost:8080/mcp), MODE (output label). Exit 0 = passed.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL || "http://localhost:8080/mcp";
const mode = process.env.MODE || "oauth";
const bearer = process.env.MCP_BEARER;
const apikey = process.env.MCP_APIKEY;

const headers = {};
if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
if (apikey) headers["X-API-KEY"] = apikey;

function fail(msg) {
  console.error(`[${mode}] FAIL: ${msg}`);
  process.exit(1);
}

const REQUIRED = [
  "stirling_describe_operation",
  "stirling_convert",
  "stirling_pages",
  "stirling_misc",
  "stirling_security",
  "stirling_upload",
  "stirling_download",
];

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers },
});
const client = new Client(
  { name: "stirling-mcp-validator", version: "1.0.0" },
  { capabilities: {} },
);

try {
  // connect() performs the initialize handshake (version negotiation + capabilities)
  await client.connect(transport);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  for (const r of REQUIRED) {
    if (!names.includes(r)) fail(`tools/list missing ${r} (got: ${names.join(", ")})`);
  }

  const res = await client.callTool({
    name: "stirling_describe_operation",
    arguments: { operation: "add-password" },
  });
  if (!JSON.stringify(res).includes("parametersSchema")) {
    fail(`describe_operation returned no parametersSchema: ${JSON.stringify(res).slice(0, 300)}`);
  }

  // File I/O round-trip: upload bytes, then download them back unchanged.
  const original = "hello mcp round-trip";
  const up = await client.callTool({
    name: "stirling_upload",
    arguments: { file: Buffer.from(original, "utf8").toString("base64"), fileName: "hello.txt" },
  });
  const upMatch = JSON.stringify(up).match(/fileId=([A-Za-z0-9_-]+)/);
  if (!upMatch) fail(`stirling_upload returned no fileId: ${JSON.stringify(up).slice(0, 200)}`);
  const fileId = upMatch[1];

  const down = await client.callTool({ name: "stirling_download", arguments: { fileId } });
  const resBlock = (down.content || []).find((b) => b.type === "resource");
  if (!resBlock?.resource?.blob) {
    fail(`stirling_download returned no resource blob: ${JSON.stringify(down).slice(0, 200)}`);
  }
  const roundTripped = Buffer.from(resBlock.resource.blob, "base64").toString("utf8");
  if (roundTripped !== original) {
    fail(`upload/download round-trip mismatch: got "${roundTripped}"`);
  }

  // A category tool with no file must surface an honest error, not a fake success.
  const cat = await client.callTool({
    name: "stirling_security",
    arguments: { operation: "add-password" },
  });
  if (cat.isError !== true) {
    fail(`stirling_security with no file should report isError, got: ${JSON.stringify(cat).slice(0, 200)}`);
  }

  console.log(
    `[${mode}] OK: real MCP SDK client connected, negotiated protocol, listed ${names.length} tools, ` +
      `describe_operation returned a schema, upload/download round-trip matched, category tool returned isError.`,
  );
  console.log(`[${mode}]   tools: ${names.join(", ")}`);
  await client.close();
  process.exit(0);
} catch (e) {
  fail(`${e?.stack || e?.message || e}`);
}
