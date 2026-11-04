// Official v2 client (@modelcontextprotocol/client): legacy, pinned 2026-07-28 and auto negotiation, plus MRTR password forms.
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

const fillPasswords = (secret) => (p) => ({
  action: "accept",
  content: Object.fromEntries(Object.keys(p.requestedSchema.properties).map((k) => [k, k === "password" ? secret : ""])),
});

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

async function mrtrAccept() {
  const { client, prompts } = await connect({ pin: MODERN_VERSION }, fillPasswords(`harness-${Date.now()}`));
  try {
    const added = await client.callTool({
      name: "stirling_security",
      arguments: { operation: "add-password", file: cfg.pdfBase64, fileName: "locked.pdf", parameters: { keyLength: 256 } },
    });
    r.check("[mrtr] add-password asked for the password once", prompts.length === 1, JSON.stringify(prompts[0]?.requestedSchema?.properties));
    r.check("[mrtr] add-password succeeded", !added.isError, firstText(added).slice(0, 120));
    const removed = await client.callTool({
      name: "stirling_security",
      arguments: { operation: "remove-password", fileId: added.structuredContent?.fileId },
    });
    r.check("[mrtr] remove-password asked again", prompts.length === 2);
    r.check("[mrtr] remove-password succeeded", !removed.isError, firstText(removed).slice(0, 120));
  } finally {
    await client.close();
  }
}

async function mrtrDecline() {
  const { client, prompts } = await connect({ pin: MODERN_VERSION }, () => ({ action: "decline" }));
  try {
    const res = await client.callTool({
      name: "stirling_security",
      arguments: { operation: "add-password", file: cfg.pdfBase64, parameters: {} },
    });
    r.check("[mrtr] declining the form cancels the operation", res.isError && /cancelled/.test(firstText(res)) && prompts.length === 1, firstText(res));
  } finally {
    await client.close();
  }
}

async function mrtrWithoutForms() {
  // A client without form support gets the pre-MRTR behaviour: the model's value is used.
  const { client } = await connect({ pin: MODERN_VERSION });
  try {
    const res = await client.callTool({
      name: "stirling_security",
      arguments: { operation: "add-password", file: cfg.pdfBase64, parameters: { password: "model-supplied" } },
    });
    r.check("[mrtr] model-supplied password is used without a prompt", !res.isError, firstText(res).slice(0, 120));
  } finally {
    await client.close();
  }
}

try {
  await eraRound("legacy", undefined);
  await eraRound(`pin ${MODERN_VERSION}`, { pin: MODERN_VERSION });
  await eraRound("auto", "auto");
  await mrtrAccept();
  await mrtrDecline();
  await mrtrWithoutForms();
  r.finish();
} catch (e) {
  r.crash(e);
}
