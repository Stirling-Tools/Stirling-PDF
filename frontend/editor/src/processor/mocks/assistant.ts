/** Mock assistant: routing rules + canned replies + suggested prompts. */

export interface AssistantRoute {
  patterns: readonly RegExp[];
  reply: string;
}

export const ASSISTANT_ROUTES: AssistantRoute[] = [
  {
    patterns: [/extract/i, /schema/i],
    reply:
      "For extraction, point the doc at /v1/<endpoint> and the schema-aware op infers fields from your typed catalogue. Confidence-check gates anything under 0.85 by default — adjust the threshold in the composer's per-op config.",
  },
  {
    patterns: [/mcp/i, /\bagent\b/i, /connect.*agent/i],
    reply:
      "MCP wiring lives under Sources → Add → Agent. You'll get an MCP URL of the shape mcp://stirling.com/agents/{id} plus scoped credentials. Scenarios drive the eval set the agent must pass before it can take real traffic.",
  },
  {
    patterns: [/redact/i, /pii/i],
    reply:
      "The redact op runs PII enforcement across SSN / DOB / accounts / contacts / names / addresses by default. Toggle categories in the composer; auto-detected PII supports blackout, replace, and mask styles.",
  },
  {
    patterns: [/deploy/i, /docker/i, /self.host/i],
    reply:
      "Self-host via the docker variant from /editor → Self-Hosted. Air-gapped tarballs ship on Enterprise. Helm charts cover us-east-1, eu-west-1, ap-southeast-1; multi-region requires the Enterprise plan.",
  },
  {
    patterns: [/rate.*limit/i, /quota/i, /throttl/i],
    reply:
      "Free is 4.2 req/min. Pro scales to 342 req/min with burst tolerance. Enterprise lifts to 2.4k req/min with per-region pools. The 429 response carries Retry-After in seconds.",
  },
  {
    patterns: [/webhook/i, /callback/i],
    reply:
      "Outbound webhooks deliver via 3× exponential backoff. We sign every payload with HMAC-SHA256 — verify via the X-Stirling-Signature header. Inbound webhooks support Bearer, HMAC, or mTLS auth.",
  },
];

export const ASSISTANT_DEFAULT_REPLY =
  "I can help with extraction, MCP / agents, redaction, deployment, rate limits, and webhooks. Try one of the suggestions, or ask something specific.";

export const ASSISTANT_SUGGESTIONS: readonly string[] = [
  "How do I wire an MCP agent?",
  "Extract fields from a COI",
  "Redact PII before storage",
  "Self-host with Docker",
  "What are the rate limits?",
  "Build a pipeline from a sample",
];

/** Resolve an input to a canned reply by walking the route table. */
export function routeAssistantReply(input: string): string {
  for (const route of ASSISTANT_ROUTES) {
    for (const pattern of route.patterns) {
      if (pattern.test(input)) return route.reply;
    }
  }
  return ASSISTANT_DEFAULT_REPLY;
}
