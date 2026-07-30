/**
 * The connection types an operator can set up, as data rather than components.
 *
 * Mirrors {@link CREATABLE_SOURCE_TYPES} deliberately: a vendor is added by describing its fields,
 * not by writing a form. That is what makes "support a load of things out of the box" true rather
 * than aspirational — a preset is an entry here plus, at most, a body template.
 *
 * Two kinds of entry:
 *
 * - **Presets** (S3, Purview, ConsignO) — a fixed shape. The operator supplies credentials and
 *   whichever endpoint their tenant lives on; they cannot change what the integration *does*.
 * - **Custom API** — a free-form base URL, path, body and headers. This is authoring power: it can
 *   aim the server at any host, so the backend restricts it to admins and lets an operator withdraw
 *   it entirely (`policies.allowCustomApiIntegrations`). `requiresCustomApi` only decides whether to
 *   *offer* it; `IntegrationConfigService` refuses the call regardless of what the client believed.
 */

import type { IntegrationType } from "@portal/api/integrations";

/** One configurable field. `control` mirrors the source builder's vocabulary. */
export interface ConnectionFieldDef {
  key: string;
  labelKey: string;
  control: "text" | "password" | "select" | "textarea" | "hostList";
  required?: boolean;
  placeholderKey?: string;
  helperTextKey?: string;
  options?: { value: string; labelKey: string }[];
  defaultValue?: string;
  /** Shown only when another field has one of these values, e.g. auth fields per authType. */
  visibleWhen?: { key: string; oneOf: string[] };
}

export interface CreatableConnectionType {
  /** Stable id; distinct from `integrationType` so several presets can share a backend type. */
  id: string;
  integrationType: IntegrationType;
  /**
   * "preset" — a supported vendor, the primary path: pick it and fill in credentials. "custom" —
   * the free-form escape hatch, deliberately set apart because it needs a developer's grasp of the
   * target API, and steering everyone here would both confuse non-technical operators and give away
   * the customisation an enterprise deal is negotiated around. Most people should never need it;
   * the answer to "my vendor isn't listed" is to request it, not to build it.
   */
  kind: "preset" | "custom";
  /** Groups the picker; also what someone scans by when they don't know the vendor's name. */
  category: ConnectionCategory;
  labelKey: string;
  descriptionKey: string;
  /**
   * Extra words search should match: former names (HelloSign), the job someone is trying to do
   * ("ocr", "notify"), and the stack it belongs to ("microsoft 365"). People search for the problem
   * as often as the product.
   */
  searchTerms?: string[];
  /** Config baked in rather than asked for — what makes a preset a preset. */
  presetConfig?: Record<string, unknown>;
  /**
   * Hostnames that identify this vendor from a stored connection whose `presetId` is absent (one
   * made before the marker, or through the API). A Discord webhook is always discord.com, so the
   * URL recovers the vendor with no marker. Matched against the host and any subdomain of it.
   */
  identifyHosts?: string[];
  /** True for entries that need admin + the server flag; see the module comment. */
  requiresCustomApi?: boolean;
  fields: ConnectionFieldDef[];
}

export type ConnectionCategory =
  | "storage"
  | "signing"
  | "security"
  | "audit"
  | "notify"
  | "advanced";

/** Display order of the category sections in the picker. */
// Substantial sections first; the two deliberate one-card sections (signing = the ConsignO
// flagship, advanced = the admin escape hatch) close the list rather than opening it.
export const CONNECTION_CATEGORIES: ConnectionCategory[] = [
  "storage",
  "security",
  "audit",
  "notify",
  "signing",
  "advanced",
];

const PREFIX = "portal.connections.types";
const COMMON = "portal.connections.commonFields";

const S3_FIELDS: ConnectionFieldDef[] = [
  {
    key: "bucket",
    labelKey: `${PREFIX}.s3.fields.bucket.label`,
    control: "text",
    required: true,
  },
  {
    key: "region",
    labelKey: `${PREFIX}.s3.fields.region.label`,
    control: "text",
    defaultValue: "us-east-1",
  },
  {
    key: "endpoint",
    labelKey: `${PREFIX}.s3.fields.endpoint.label`,
    control: "text",
    helperTextKey: `${PREFIX}.s3.fields.endpoint.helperText`,
  },
  {
    key: "accessKeyId",
    labelKey: `${PREFIX}.s3.fields.accessKeyId.label`,
    control: "text",
    required: true,
  },
  {
    key: "secretAccessKey",
    labelKey: `${PREFIX}.s3.fields.secretAccessKey.label`,
    control: "password",
    required: true,
  },
];

const PURVIEW_FIELDS: ConnectionFieldDef[] = [
  {
    key: "tenantId",
    labelKey: `${PREFIX}.purview.fields.tenantId.label`,
    control: "text",
    required: true,
    placeholderKey: `${PREFIX}.purview.fields.tenantId.placeholder`,
    helperTextKey: `${PREFIX}.purview.fields.tenantId.helperText`,
  },
  // Optional: labelling is local and needs only the tenant id. These buy the label picker.
  {
    key: "clientId",
    labelKey: `${PREFIX}.purview.fields.clientId.label`,
    control: "text",
    helperTextKey: `${PREFIX}.purview.fields.clientId.helperText`,
  },
  {
    key: "clientSecret",
    labelKey: `${PREFIX}.purview.fields.clientSecret.label`,
    control: "password",
  },
];

const CONSIGNO_FIELDS: ConnectionFieldDef[] = [
  {
    key: "baseUrl",
    labelKey: `${PREFIX}.consigno.fields.baseUrl.label`,
    control: "text",
    required: true,
    placeholderKey: `${PREFIX}.consigno.fields.baseUrl.placeholder`,
    helperTextKey: `${PREFIX}.consigno.fields.baseUrl.helperText`,
  },
  {
    key: "loginHeaders.X-Client-Id",
    labelKey: `${PREFIX}.consigno.fields.clientId.label`,
    control: "text",
    required: true,
  },
  {
    key: "loginHeaders.X-Client-Secret",
    labelKey: `${PREFIX}.consigno.fields.clientSecret.label`,
    control: "password",
    required: true,
  },
  {
    key: "loginBody.username",
    labelKey: `${PREFIX}.consigno.fields.username.label`,
    control: "text",
    required: true,
  },
  {
    key: "loginBody.password",
    labelKey: `${PREFIX}.consigno.fields.password.label`,
    control: "password",
    required: true,
  },
  {
    key: "loginBody.tenantId",
    labelKey: `${PREFIX}.consigno.fields.tenantId.label`,
    control: "text",
    helperTextKey: `${PREFIX}.consigno.fields.tenantId.helperText`,
  },
];

const CUSTOM_API_FIELDS: ConnectionFieldDef[] = [
  {
    key: "baseUrl",
    labelKey: `${PREFIX}.api.fields.baseUrl.label`,
    control: "text",
    required: true,
    placeholderKey: `${PREFIX}.api.fields.baseUrl.placeholder`,
    helperTextKey: `${PREFIX}.api.fields.baseUrl.helperText`,
  },
  {
    key: "authType",
    labelKey: `${PREFIX}.api.fields.authType.label`,
    control: "select",
    defaultValue: "NONE",
    options: [
      {
        value: "NONE",
        labelKey: `${PREFIX}.api.fields.authType.options.none.label`,
      },
      {
        value: "BEARER",
        labelKey: `${PREFIX}.api.fields.authType.options.bearer.label`,
      },
      {
        value: "BASIC",
        labelKey: `${PREFIX}.api.fields.authType.options.basic.label`,
      },
      {
        value: "HEADER",
        labelKey: `${PREFIX}.api.fields.authType.options.header.label`,
      },
      {
        value: "TOKEN_LOGIN",
        labelKey: `${PREFIX}.api.fields.authType.options.tokenLogin.label`,
      },
    ],
  },
  {
    key: "token",
    labelKey: `${PREFIX}.api.fields.token.label`,
    control: "password",
    required: true,
    visibleWhen: { key: "authType", oneOf: ["BEARER", "HEADER"] },
  },
  {
    key: "headerName",
    labelKey: `${PREFIX}.api.fields.headerName.label`,
    control: "text",
    required: true,
    placeholderKey: `${PREFIX}.api.fields.headerName.placeholder`,
    visibleWhen: { key: "authType", oneOf: ["HEADER"] },
  },
  {
    key: "username",
    labelKey: `${PREFIX}.api.fields.username.label`,
    control: "text",
    required: true,
    visibleWhen: { key: "authType", oneOf: ["BASIC"] },
  },
  {
    key: "password",
    labelKey: `${PREFIX}.api.fields.password.label`,
    control: "password",
    required: true,
    visibleWhen: { key: "authType", oneOf: ["BASIC"] },
  },
  {
    key: "loginPath",
    labelKey: `${PREFIX}.api.fields.loginPath.label`,
    control: "text",
    required: true,
    placeholderKey: `${PREFIX}.api.fields.loginPath.placeholder`,
    visibleWhen: { key: "authType", oneOf: ["TOKEN_LOGIN"] },
  },
  {
    key: "tokenResponseHeader",
    labelKey: `${PREFIX}.api.fields.tokenResponseHeader.label`,
    control: "text",
    required: true,
    helperTextKey: `${PREFIX}.api.fields.tokenResponseHeader.helperText`,
    visibleWhen: { key: "authType", oneOf: ["TOKEN_LOGIN"] },
  },
  {
    key: "tokenHeaderName",
    labelKey: `${PREFIX}.api.fields.tokenHeaderName.label`,
    control: "text",
    required: true,
    visibleWhen: { key: "authType", oneOf: ["TOKEN_LOGIN"] },
  },
  {
    key: "resultUrlHosts",
    labelKey: `${PREFIX}.api.fields.resultUrlHosts.label`,
    control: "hostList",
    helperTextKey: `${PREFIX}.api.fields.resultUrlHosts.helperText`,
  },
];

/**
 * Fields shared across vendors. "API key" reads the same for VirusTotal and Mindee, so it is
 * translated once here rather than 25 times under each vendor's namespace; only genuinely
 * vendor-specific wording (Purview's "Directory (tenant) ID") lives under the vendor.
 */
const field = {
  /** Tenant-specific server URL. `id` names the vendor whose placeholder/help to show. */
  baseUrl: (id: string): ConnectionFieldDef => ({
    key: "baseUrl",
    labelKey: `${COMMON}.baseUrl.label`,
    control: "text",
    required: true,
    placeholderKey: `${PREFIX}.${id}.baseUrlPlaceholder`,
    helperTextKey: `${COMMON}.baseUrl.helperText`,
  }),
  /** The URL a vendor hands you to post to (Teams/Zapier/webhook), which IS the whole endpoint. */
  webhookUrl: (id: string): ConnectionFieldDef => ({
    key: "baseUrl",
    labelKey: `${COMMON}.webhookUrl.label`,
    control: "text",
    required: true,
    placeholderKey: `${PREFIX}.${id}.baseUrlPlaceholder`,
    helperTextKey: `${COMMON}.webhookUrl.helperText`,
  }),
  apiKey: (): ConnectionFieldDef => ({
    key: "token",
    labelKey: `${COMMON}.apiKey.label`,
    control: "password",
    required: true,
  }),
  accessToken: (): ConnectionFieldDef => ({
    key: "token",
    labelKey: `${COMMON}.accessToken.label`,
    control: "password",
    required: true,
    helperTextKey: `${COMMON}.accessToken.helperText`,
  }),
  username: (labelKey = `${COMMON}.username.label`): ConnectionFieldDef => ({
    key: "username",
    labelKey,
    control: "text",
    required: true,
  }),
  password: (labelKey = `${COMMON}.password.label`): ConnectionFieldDef => ({
    key: "password",
    labelKey,
    control: "password",
    required: true,
  }),
};

/**
 * A vendor whose integration is "an HTTP API with known mechanics". The auth shape, and the base
 * URL when the vendor has a single global one, are baked into `preset`; the operator supplies only
 * credentials. Adding a vendor is this entry plus two lines of copy — no component, no backend.
 */
function apiPreset(spec: {
  id: string;
  category: ConnectionCategory;
  preset: Record<string, unknown>;
  fields: ConnectionFieldDef[];
  searchTerms?: string[];
  identifyHosts?: string[];
}): CreatableConnectionType {
  return {
    id: spec.id,
    integrationType: "API",
    kind: "preset",
    category: spec.category,
    labelKey: `${PREFIX}.${spec.id}.label`,
    descriptionKey: `${PREFIX}.${spec.id}.description`,
    searchTerms: spec.searchTerms,
    presetConfig: spec.preset,
    identifyHosts: spec.identifyHosts,
    fields: spec.fields,
  };
}

/**
 * Vendors whose HTTP contract has been verified against their published documentation.
 *
 * The bar is deliberately narrow, because the pipeline can make exactly ONE call per step and
 * carries nothing from one step to the next. A vendor earns a place here only if it is:
 *
 * 1. **one call** - no submit-then-poll, no upload-then-attach;
 * 2. **a static credential** - no OAuth2 refresh, no per-request signature;
 * 3. **useful in that one call** - the answer comes back, or the call itself is the point.
 *
 * That excludes most of the obvious names. Every e-signature vendor is multi-call (create, send,
 * then retrieve the signed file later). Azure Document Intelligence, ABBYY, VirusTotal, Rossum and
 * Mindee are all submit-then-poll. SharePoint, Drive, Box, Salesforce and the rest are OAuth. They
 * are not missing by oversight - they cannot work correctly here yet, and listing them would be a
 * promise the engine cannot keep.
 */
const API_PRESETS: CreatableConnectionType[] = [
  // ---- malware & active content -------------------------------------------------------------
  apiPreset({
    id: "cloudmersive",
    category: "security",
    preset: {
      authType: "HEADER",
      headerName: "Apikey",
      baseUrl: "https://api.cloudmersive.com",
    },
    fields: [field.apiKey()],
    searchTerms: ["malware", "antivirus", "virus", "scan", "threat"],
  }),
  apiPreset({
    id: "cloudmersiveadvanced",
    category: "security",
    preset: {
      authType: "HEADER",
      headerName: "Apikey",
      baseUrl: "https://api.cloudmersive.com",
    },
    fields: [field.apiKey()],
    searchTerms: [
      "macro",
      "executable",
      "script",
      "active content",
      "malware",
      "ole",
      "scan",
    ],
  }),
  apiPreset({
    id: "clamav",
    category: "security",
    // Self-hosted: no vendor account, no key, and the document never leaves the estate - which is
    // the whole argument for on-prem customers who cannot send files to a cloud scanner.
    preset: { authType: "NONE" },
    fields: [field.baseUrl("clamav")],
    searchTerms: [
      "virus",
      "malware",
      "antivirus",
      "scan",
      "self-hosted",
      "on-prem",
    ],
  }),

  // ---- audit & SIEM ---------------------------------------------------------------------------
  apiPreset({
    id: "splunk",
    category: "audit",
    preset: {
      authType: "HEADER",
      headerName: "Authorization",
      headerPrefix: "Splunk",
    },
    fields: [field.baseUrl("splunk"), field.apiKey()],
    searchTerms: ["siem", "hec", "audit", "log", "event", "compliance"],
  }),
  apiPreset({
    id: "elastic",
    category: "audit",
    preset: {
      authType: "HEADER",
      headerName: "Authorization",
      headerPrefix: "ApiKey",
    },
    fields: [field.baseUrl("elastic"), field.apiKey()],
    searchTerms: ["siem", "elasticsearch", "kibana", "audit", "log", "index"],
  }),
  apiPreset({
    id: "sumologic",
    category: "audit",
    preset: { authType: "NONE" },
    fields: [field.webhookUrl("sumologic")],
    searchTerms: ["siem", "audit", "log", "collector"],
  }),

  // ---- PII detection ---------------------------------------------------------------------------
  apiPreset({
    id: "presidio",
    category: "security",
    // Self-hosted and unauthenticated by design; takes TEXT, so it needs extracted text rather
    // than the document itself.
    preset: { authType: "NONE" },
    fields: [field.baseUrl("presidio")],
    searchTerms: ["pii", "dlp", "sensitive", "redact", "gdpr", "self-hosted"],
  }),

  // ---- email the document ----------------------------------------------------------------------
  apiPreset({
    id: "sendgrid",
    category: "notify",
    preset: { authType: "BEARER", baseUrl: "https://api.sendgrid.com/v3" },
    fields: [field.apiKey()],
    searchTerms: ["email", "mail", "send", "attachment", "twilio"],
  }),
  apiPreset({
    id: "mailgun",
    category: "notify",
    // Region matters: EU domains must use api.eu.mailgun.net and are not auto-detected.
    preset: { authType: "BASIC", username: "api" },
    fields: [
      field.baseUrl("mailgun"),
      field.password(`${COMMON}.apiKey.label`),
    ],
    searchTerms: ["email", "mail", "send", "attachment"],
  }),

  // ---- notify ------------------------------------------------------------------------------------
  apiPreset({
    id: "slack",
    category: "notify",
    preset: { authType: "NONE" },
    fields: [field.webhookUrl("slack")],
    searchTerms: ["chat", "notify", "message", "alert"],
    identifyHosts: ["slack.com"],
  }),
  apiPreset({
    id: "teams",
    category: "notify",
    preset: { authType: "NONE" },
    fields: [field.webhookUrl("teams")],
    searchTerms: ["microsoft", "chat", "notify", "message", "alert"],
    // Classic incoming webhooks post from *.webhook.office.com; Workflows from *.logic.azure.com.
    identifyHosts: ["webhook.office.com", "logic.azure.com"],
  }),
  apiPreset({
    id: "discord",
    category: "notify",
    preset: { authType: "NONE" },
    fields: [field.webhookUrl("discord")],
    searchTerms: ["chat", "notify", "message"],
    identifyHosts: ["discord.com", "discordapp.com"],
  }),
  apiPreset({
    id: "googlechat",
    category: "notify",
    preset: { authType: "NONE" },
    fields: [field.webhookUrl("googlechat")],
    searchTerms: ["google", "chat", "notify", "workspace", "message"],
    identifyHosts: ["chat.googleapis.com"],
  }),
  apiPreset({
    id: "zapier",
    category: "notify",
    preset: { authType: "NONE" },
    fields: [field.webhookUrl("zapier")],
    searchTerms: ["make", "automation", "workflow", "trigger", "no-code"],
    identifyHosts: ["zapier.com"],
  }),
  apiPreset({
    id: "webhook",
    category: "notify",
    preset: { authType: "NONE" },
    fields: [field.webhookUrl("webhook")],
    searchTerms: ["http", "post", "callback", "custom", "notify"],
  }),

  // ---- file & attach: tickets and pages are destinations just like buckets -----------------------
  apiPreset({
    id: "jira",
    category: "storage",
    preset: { authType: "BASIC" },
    fields: [
      field.baseUrl("jira"),
      field.username(`${COMMON}.email.label`),
      field.password(`${COMMON}.apiToken.label`),
    ],
    searchTerms: ["atlassian", "issue", "ticket", "attach", "project"],
  }),
  apiPreset({
    id: "confluence",
    category: "storage",
    preset: { authType: "BASIC" },
    fields: [
      field.baseUrl("confluence"),
      field.username(`${COMMON}.email.label`),
      field.password(`${COMMON}.apiToken.label`),
    ],
    searchTerms: ["atlassian", "wiki", "page", "attach", "space"],
  }),

  // ---- file to storage ------------------------------------------------------------------------------
  apiPreset({
    id: "nextcloud",
    category: "storage",
    preset: { authType: "BASIC" },
    fields: [
      field.baseUrl("nextcloud"),
      field.username(),
      field.password(`${PREFIX}.nextcloud.fields.appPassword`),
    ],
    searchTerms: ["owncloud", "webdav", "files", "self-hosted", "upload"],
  }),
];

export const CREATABLE_CONNECTION_TYPES: CreatableConnectionType[] = [
  {
    id: "s3",
    integrationType: "S3",
    kind: "preset",
    category: "storage",
    labelKey: `${PREFIX}.s3.label`,
    descriptionKey: `${PREFIX}.s3.description`,
    searchTerms: ["aws", "bucket", "minio", "object storage"],
    fields: S3_FIELDS,
  },
  {
    id: "purview",
    integrationType: "PURVIEW",
    kind: "preset",
    category: "security",
    labelKey: `${PREFIX}.purview.label`,
    descriptionKey: `${PREFIX}.purview.description`,
    searchTerms: ["microsoft", "sensitivity", "label", "classification", "mip"],
    fields: PURVIEW_FIELDS,
  },
  {
    id: "consigno",
    integrationType: "CONSIGNO",
    kind: "preset",
    category: "signing",
    labelKey: `${PREFIX}.consigno.label`,
    descriptionKey: `${PREFIX}.consigno.description`,
    searchTerms: ["notarius", "notarize", "esign", "sign", "certifio"],
    // The vendor's auth shape, baked in: the operator supplies credentials, never the mechanics.
    presetConfig: {
      authType: "TOKEN_LOGIN",
      loginPath: "/auth/login",
      tokenResponseHeader: "X-Auth-Token",
      tokenHeaderName: "X-Auth-Token",
    },
    fields: CONSIGNO_FIELDS,
  },
  ...API_PRESETS,
  {
    id: "api",
    integrationType: "API",
    kind: "custom",
    category: "advanced",
    labelKey: `${PREFIX}.api.label`,
    descriptionKey: `${PREFIX}.api.description`,
    requiresCustomApi: true,
    fields: CUSTOM_API_FIELDS,
  },
];

/** Free-text match over name, description-agnostic keywords and category. */
export function searchConnectionTypes(
  types: CreatableConnectionType[],
  query: string,
  label: (key: string) => string,
): CreatableConnectionType[] {
  const q = query.trim().toLowerCase();
  if (!q) return types;
  return types.filter((type) => {
    const haystack = [
      label(type.labelKey),
      type.id,
      type.category,
      ...(type.searchTerms ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}

/** The types this caller may create. `customApi` comes from the server, never inferred here. */
export function creatableConnectionTypes(
  capabilities: { customApi: boolean } | undefined,
): CreatableConnectionType[] {
  return CREATABLE_CONNECTION_TYPES.filter(
    (type) => !type.requiresCustomApi || capabilities?.customApi === true,
  );
}

/** The supported vendors — the primary path an operator picks from. */
export function presetConnectionTypes(): CreatableConnectionType[] {
  return CREATABLE_CONNECTION_TYPES.filter((type) => type.kind === "preset");
}

/**
 * Build the config payload for a type: its preset, then the operator's answers.
 *
 * Dotted keys (`loginBody.password`) nest, so a preset's credentials land where the backend expects
 * them *and* where `SecretMasker` can see them — it recurses into nested maps and masks by key name,
 * so a flat `loginBody` string would hand the password back in clear on every read.
 */
/**
 * Reserved config key recording which preset created a connection.
 *
 * A stored connection only carries an `integrationType`, and most presets share `"API"` - Discord,
 * Splunk, Jira and fourteen others are all `API`. Without this, mapping a saved connection back to
 * its preset is guesswork, and guessing wrong means the edit form renders another vendor's fields
 * and overwrites the config on save. The backend keeps `config` as a free-form map and ignores keys
 * it does not model, so this rides along without a schema change.
 */
export const PRESET_ID_KEY = "presetId";

export function buildConnectionConfig(
  type: CreatableConnectionType,
  values: Record<string, string>,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    ...(type.presetConfig ?? {}),
    [PRESET_ID_KEY]: type.id,
  };
  for (const field of type.fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === "") continue;
    const value: unknown =
      field.control === "hostList"
        ? raw
            .split(/[\s,]+/)
            .map((entry) => entry.trim())
            .filter(Boolean)
        : raw;
    setPath(config, field.key, value);
  }
  return config;
}

/** Whether a field should be shown given the answers so far. */
export function isFieldVisible(
  field: ConnectionFieldDef,
  values: Record<string, string>,
): boolean {
  if (!field.visibleWhen) return true;
  const current = values[field.visibleWhen.key] ?? "";
  return field.visibleWhen.oneOf.includes(current);
}

/** The hostname of a URL, lowercased, or undefined if it is missing or unparseable. */
function hostOf(url: unknown): string | undefined {
  if (typeof url !== "string" || url === "") return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * The vendor a stored connection points at, recovered from its URL when the `presetId` marker is
 * absent. Only an unambiguous host wins: two presets sharing a host (the Cloudmersive pair) is
 * treated as unknown rather than guessed, since guessing wrong would show the wrong form.
 */
function presetByHost(host: string): CreatableConnectionType | undefined {
  const matches = new Set<CreatableConnectionType>();
  for (const type of CREATABLE_CONNECTION_TYPES) {
    // Webhook vendors: the operator supplies the URL, so match the vendor's domain and subdomains.
    for (const sig of type.identifyHosts ?? []) {
      if (host === sig || host.endsWith(`.${sig}`)) matches.add(type);
    }
    // Fixed-host presets: the base URL is baked in, so an exact host match identifies them.
    if (hostOf(type.presetConfig?.baseUrl) === host) matches.add(type);
  }
  return matches.size === 1 ? [...matches][0] : undefined;
}

/** The type an existing connection was made from, so editing reuses its form. */
export function connectionTypeOf(
  integrationType: IntegrationType,
  config?: Record<string, unknown> | null,
): CreatableConnectionType | undefined {
  const presetId = config?.[PRESET_ID_KEY];
  if (typeof presetId === "string") {
    const exact = CREATABLE_CONNECTION_TYPES.find((t) => t.id === presetId);
    if (exact) return exact;
  }

  const candidates = CREATABLE_CONNECTION_TYPES.filter(
    (type) => type.integrationType === integrationType,
  );
  if (candidates.length === 1) return candidates[0];

  // No marker (made before it existed, or through the API): recover the vendor from the URL it
  // points at, since a Discord webhook is always discord.com and so on. Showing "Custom API" for
  // something the operator set up as Discord is both confusing and, on save, what rewrote the
  // webhook as another vendor's endpoint.
  const host = hostOf(config?.baseUrl);
  if (host) {
    const byHost = presetByHost(host);
    if (byHost && byHost.integrationType === integrationType) return byHost;
  }

  // Still unknown: fall back to the free-form entry rather than naming a vendor at random. It shows
  // the base URL and auth the connection actually has, so editing preserves them.
  return candidates.find((type) => type.kind === "custom") ?? candidates[0];
}

/** Blank answers for a new connection: the fields' defaults, plus an empty name. */
export function emptyConnectionValues(
  type: CreatableConnectionType,
): Record<string, string> {
  const values: Record<string, string> = { name: "" };
  for (const field of type.fields) {
    values[field.key] = field.defaultValue ?? "";
  }
  return values;
}

/**
 * Seed the form from a stored connection. Secrets arrive masked and are carried back verbatim,
 * which is what tells the backend to keep the stored value (`SecretMasker.merge`).
 */
export function connectionFormValues(
  type: CreatableConnectionType,
  connection: { name: string; config: Record<string, unknown> },
): Record<string, string> {
  const values = emptyConnectionValues(type);
  values.name = connection.name;
  for (const field of type.fields) {
    const stored = getPath(connection.config, field.key);
    if (stored === undefined || stored === null) continue;
    values[field.key] = Array.isArray(stored)
      ? stored.join(", ")
      : String(stored);
  }
  return values;
}

/** Name plus every required field that is actually on screen. */
export function connectionFormValid(
  type: CreatableConnectionType,
  values: Record<string, string>,
): boolean {
  if ((values.name ?? "").trim() === "") return false;
  return type.fields.every(
    (field) =>
      !field.required ||
      !isFieldVisible(field, values) ||
      (values[field.key] ?? "").trim() !== "",
  );
}

function getPath(source: Record<string, unknown>, path: string): unknown {
  let node: unknown = source;
  for (const segment of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split(".");
  let node = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const next = node[segments[i]];
    if (typeof next !== "object" || next === null) {
      node[segments[i]] = {};
    }
    node = node[segments[i]] as Record<string, unknown>;
  }
  node[segments[segments.length - 1]] = value;
}
