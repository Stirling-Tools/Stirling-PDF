// Official v1 SDK client (@modelcontextprotocol/sdk), which schema-validates every response.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { checkResultLink, firstText, isPdf, loadConfig, reporter } from "./lib.mjs";

const APP_URI = "ui://stirling-pdf/app.html";
const PICKER_URI = "ui://stirling-pdf/picker.html";
const r = reporter("sdk-v1");
const cfg = loadConfig();

const transport = new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.authHeaders } });
const client = new Client({ name: "stirling-mcp-conformance", version: "1.0.0" });
const call = (name, args) => client.callTool({ name, arguments: args });

async function toolCatalogue() {
  const info = client.getServerVersion();
  r.check("server identifies as stirling-pdf-mcp", info?.name === "stirling-pdf-mcp", info?.name);
  const { tools } = await client.listTools();
  r.check("tools/list is schema-valid", tools.length > 0, `${tools.length} tools`);
  const pages = tools.find((t) => t.name === "stirling_pages");
  const attachment = pages?.inputSchema?.properties?.inputFile;
  r.check("inputFile attachment requires download_url and file_id", JSON.stringify(attachment?.required) === '["download_url","file_id"]', JSON.stringify(attachment?.required));
  const fileParams = pages?._meta?.["openai/fileParams"];
  if (fileParams) r.check("openai/fileParams names inputFile", JSON.stringify(fileParams) === '["inputFile"]', JSON.stringify(fileParams));
  else r.skip("openai/fileParams", "not advertised (mcp.fileUrlAllowedHosts is empty)");
  return tools;
}

async function fileRoundTrip() {
  const up = await call("stirling_upload", { file: cfg.pdfBase64, fileName: "harness.pdf" });
  const uploadedId = up.structuredContent?.fileId;
  r.check("upload returns a fileId", !up.isError && uploadedId, firstText(up).slice(0, 160));
  r.check("upload carries no download link", !up.structuredContent?.downloadUrl, up.structuredContent?.downloadUrl);

  const rotated = await call("stirling_pages", { operation: "rotate-pdf", fileId: uploadedId, parameters: { angle: 90 } });
  r.check("rotate-pdf by fileId", !rotated.isError && rotated.structuredContent?.fileId, firstText(rotated).slice(0, 160));
  r.check("result card is a file card", rotated.structuredContent?.kind === "file" && rotated.structuredContent?.operation === "rotate-pdf", JSON.stringify(rotated.structuredContent));
  await checkResultLink(r, cfg, "rotate-pdf", rotated.structuredContent);

  const compressed = await call("stirling_misc", { operation: "compress-pdf", fileId: rotated.structuredContent?.fileId, parameters: { optimizeLevel: 2 } });
  r.check("compress-pdf chained on the previous result", !compressed.isError && compressed.structuredContent?.fileId, firstText(compressed).slice(0, 160));

  const down = await call("stirling_download", { fileId: compressed.structuredContent?.fileId });
  const blob = down.content?.find((c) => c.type === "resource")?.resource?.blob;
  r.check("download returns the result inline as a PDF", blob && isPdf(Buffer.from(blob, "base64")), firstText(down).slice(0, 120));
}

async function errorPaths() {
  const described = await call("stirling_describe_operation", { operation: "add-password" });
  r.check("describe_operation returns a parameter schema", JSON.stringify(described).includes("parametersSchema"));
  const unknown = await call("stirling_pages", { operation: "rotate-pdf", fileId: "999999999", parameters: { angle: 90 } });
  r.check("unknown fileId is an honest error", unknown.isError && /Unknown or expired/.test(firstText(unknown)), firstText(unknown));
  const noFile = await call("stirling_security", { operation: "add-password" });
  r.check("missing input file is an error", noFile.isError === true, firstText(noFile).slice(0, 120));
  const plainHttp = await call("stirling_upload", { inputFile: { download_url: "http://files.example.com/a.pdf", file_id: "f1" } });
  r.check("attachment over plain HTTP is refused", plainHttp.isError && /HTTPS/.test(firstText(plainHttp)), firstText(plainHttp));
  // .invalid never resolves, so this fails closed whatever the allowlist says.
  const foreign = await call("stirling_upload", { inputFile: { download_url: "https://attachments.harness.invalid/a.pdf", file_id: "f2" } });
  r.check("attachment from an unlisted or unresolvable host is refused", foreign.isError && !foreign.structuredContent?.fileId, firstText(foreign));
}

async function widget(tools) {
  const caps = client.getServerCapabilities() ?? {};
  const { resources } = await client.listResources();
  const advertised = Boolean(caps.extensions?.["io.modelcontextprotocol/ui"]) || resources.length > 0;
  const picker = tools.find((t) => t.name === "stirling_select_file");
  if (!advertised) {
    r.check("widget off: no ui:// resources and no picker tool", resources.length === 0 && !picker);
    return;
  }
  const uris = resources.map((res) => res.uri).sort();
  r.check("widget resources listed", JSON.stringify(uris) === JSON.stringify([APP_URI, PICKER_URI]), uris.join(","));
  const html = (await client.readResource({ uri: APP_URI })).contents[0];
  r.check("result card is an MCP App", html.mimeType === "text/html;profile=mcp-app" && html.text.length > 0, html.mimeType);
  r.check("result card declares an empty CSP", JSON.stringify(html._meta?.ui?.csp?.connectDomains) === "[]", JSON.stringify(html._meta?.ui?.csp));
  const pages = tools.find((t) => t.name === "stirling_pages");
  r.check("operation tools render the result card", pages?._meta?.ui?.resourceUri === APP_URI, pages?._meta?.ui?.resourceUri);
  r.check("picker is a thread entrypoint", picker?._meta?.["openai/ui"]?.entrypoints?.[0]?.type === "thread", JSON.stringify(picker?._meta));
  const shown = await call("stirling_select_file", { purpose: "Conformance check" });
  r.check("picker returns a picker card", shown.structuredContent?.kind === "picker", JSON.stringify(shown.structuredContent));
}

try {
  await client.connect(transport);
  const tools = await toolCatalogue();
  await fileRoundTrip();
  await errorPaths();
  await widget(tools);
  await client.close();
  r.finish();
} catch (e) {
  r.crash(e);
}
