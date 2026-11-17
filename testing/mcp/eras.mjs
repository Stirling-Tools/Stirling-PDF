// Official v2 client (@modelcontextprotocol/client): legacy, pinned 2026-07-28 and auto negotiation, plus passwords passed in parameters.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import { MODERN_VERSION, checkResultLink, firstText, loadConfig, reporter } from "./lib.mjs";

const r = reporter("eras");
const cfg = loadConfig();

async function connect(mode, elicit) {
  const opts = { capabilities: elicit ? { elicitation: { form: {} } } : {} };
  if (mode) opts.versionNegotiation = { mode };
  const client = new Client({ name: "stirling-mcp-conformance", version: "1.0.0" }, opts);
  const prompts = [];
  if (elicit) {
    client.setRequestHandler("elicitation/create", async (req) => {
      prompts.push(req.params);
      return elicit(req.params);
    });
  }
  const transport = new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.authHeaders } });
  await client.connect(transport);
  return { client, prompts };
}

async function eraRound(label, mode) {
  const { client } = await connect(mode);
  try {
    r.check(`[${label}] connected`, true, `era=${client.getProtocolEra?.() ?? "n/a"}`);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    r.check(`[${label}] tools/list is sorted`, JSON.stringify(names) === JSON.stringify([...names].sort()), names.join(","));
    r.check(`[${label}] core tools listed`, ["stirling_pages", "stirling_security", "stirling_upload"].every((n) => names.includes(n)));
    const res = await client.callTool({
      name: "stirling_pages",
      arguments: { operation: "rotate-pdf", file: cfg.pdfBase64, fileName: `era-${label}.pdf`, parameters: { angle: 90 } },
    });
    r.check(`[${label}] rotate-pdf returns a fileId`, !res.isError && res.structuredContent?.fileId, res.isError ? firstText(res).slice(0, 160) : `fileId=${res.structuredContent?.fileId}`);
    await checkResultLink(r, cfg, `[${label}] rotate-pdf`, res.structuredContent);
    const { resources } = await client.listResources();
    r.check(`[${label}] resources/list answers`, Array.isArray(resources), `${resources.length} resource(s)`);
  } finally {
    await client.close();
  }
}

async function passwordsInParameters() {
  // Forms are supported here, yet the server must not ask: the password travels in parameters.
  const { client, prompts } = await connect({ pin: MODERN_VERSION }, () => ({ action: "decline" }));
  const secret = `harness-${Date.now()}`;
  try {
    const added = await client.callTool({
      name: "stirling_security",
      arguments: { operation: "add-password", file: cfg.pdfBase64, fileName: "locked.pdf", parameters: { password: secret, keyLength: 256 } },
    });
    r.check("[mrtr] add-password succeeds without a prompt", !added.isError && prompts.length === 0, firstText(added).slice(0, 120));
    const removed = await client.callTool({
      name: "stirling_security",
      arguments: { operation: "remove-password", fileId: added.structuredContent?.fileId, parameters: { password: secret } },
    });
    r.check("[mrtr] remove-password succeeds without a prompt", !removed.isError && prompts.length === 0, firstText(removed).slice(0, 120));
  } finally {
    await client.close();
  }
}

async function passwordsWithoutForms() {
  const { client } = await connect({ pin: MODERN_VERSION });
  try {
    const res = await client.callTool({
      name: "stirling_security",
      arguments: { operation: "add-password", file: cfg.pdfBase64, parameters: { password: "model-supplied" } },
    });
    r.check("[mrtr] model-supplied password is used without forms support", !res.isError, firstText(res).slice(0, 120));
  } finally {
    await client.close();
  }
}

try {
  await eraRound("legacy", undefined);
  await eraRound(`pin ${MODERN_VERSION}`, { pin: MODERN_VERSION });
  await eraRound("auto", "auto");
  await passwordsInParameters();
  await passwordsWithoutForms();
  r.finish();
} catch (e) {
  r.crash(e);
}
