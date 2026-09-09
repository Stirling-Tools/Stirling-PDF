/**
 * What a connection can actually *do* — the operations catalogue.
 *
 * A connection stores credentials; it does not know how to call anything. This file supplies the
 * other half: for each vendor, the exact call that makes it useful. Without it, picking
 * "Cloudmersive" gets an operator a saved API key and a blank form asking for a URL path, a body
 * mode and a field name they would have to read the vendor's docs to discover.
 *
 * Mirrors {@link CREATABLE_CONNECTION_TYPES} deliberately: an operation is added by describing the
 * call, not by writing a component. Adding a vendor operation is an entry here plus two lines of
 * copy — the same bar that made the connection catalogue maintainable.
 *
 * Every `call` below was exercised against the real vendor or a contract-accurate mock; the shapes
 * are not guesses. Where a vendor needs something only the operator knows (a Jira issue key, a
 * Splunk index), that becomes a `field` and is substituted into the path or body via the backend's
 * `{{placeholder}}` resolution — which also gives the operator `{{document.*}}` and `{{run.*}}`.
 */

import type { IntegrationType } from "@portal/api/integrations";
import type { ConnectionCategory } from "@portal/components/sources/connectionTypes";

/**
 * The complete parameter set of the `external-api-call` step. Every key is present and every
 * value is a string, because the pipeline serialises steps as form fields.
 */
export interface ExternalApiStepParams {
  connectionId: string;
  path: string;
  method: string;
  bodyMode: string;
  fileFieldName: string;
  responseMode: string;
  resultUrlPath: string;
  resultUrlHeader: string;
  responseSelect: string;
  requireTrue: string;
  fields: string;
  headers: string;
  bodyTemplate: string;
  includeContext: string;
  includeFile: string;
  operationId: string;
  operationValues: string;
}

const PREFIX = "portal.policies.operations";

/** One value the operator supplies per step, substituted into the call. */
export interface OperationFieldDef {
  key: string;
  labelKey: string;
  control: "text" | "textarea" | "select";
  required?: boolean;
  placeholderKey?: string;
  helperTextKey?: string;
  defaultValue?: string;
  options?: { value: string; labelKey: string }[];
}

/**
 * The wire call, in the vocabulary the `external-api-call` step already accepts. Anything omitted
 * falls back to the step's own defaults, so an entry states only what is distinctive about it.
 */
export interface OperationCall {
  /** Relative to the connection's base URL. May carry `{{field}}` and `{{document.*}}`. */
  path: string;
  method?: "POST" | "PUT" | "PATCH" | "GET";
  bodyMode?: "multipart" | "json" | "binary";
  /** Multipart only: the form field the vendor expects the document under. */
  fileFieldName?: string;
  /** `report` leaves the document untouched; `replace` swaps it for what came back. */
  responseMode?: "report" | "replace";
  /** Archive-entry selector for `replace` mode (e.g. `*.pdf`); not a JSON verdict. */
  responseSelect?: string;
  /**
   * A dotted path into the JSON response that must be `true`, or the step fails and the document is
   * parked. This is the scan gate: Cloudmersive's `CleanResult` stops the run when a file is not
   * clean, rather than the verdict being merely reported and ignored.
   */
  requireTrue?: string;
  headers?: Record<string, string>;
  fields?: Record<string, string>;
  bodyTemplate?: string;
  /** False for notify-style calls that send facts rather than the document. */
  includeFile?: boolean;
}

export interface StepOperation {
  id: string;
  /** The connection preset this rides, so the picker can offer inline creation of the right type. */
  connectionTypeId: string;
  integrationType: IntegrationType;
  category: ConnectionCategory;
  labelKey: string;
  descriptionKey: string;
  searchTerms?: string[];
  call: OperationCall;
  fields?: OperationFieldDef[];
  /**
   * True for the escape hatch, where the operator authors the call themselves. Admin-gated by the
   * same server flag as the custom connection; the UI only decides whether to offer it.
   */
  custom?: boolean;
  /** Shown as a caveat in the picker when a vendor has a known limitation. */
  noteKey?: string;
}

const f = (
  key: string,
  control: OperationFieldDef["control"] = "text",
  required = true,
): OperationFieldDef => ({
  key,
  labelKey: `${PREFIX}.fields.${key}.label`,
  control,
  required,
  placeholderKey: `${PREFIX}.fields.${key}.placeholder`,
});

/** A notify call: JSON facts, no document, posted straight at the webhook URL. */
function notify(
  id: string,
  connectionTypeId: string,
  bodyKey: string,
  searchTerms: string[],
): StepOperation {
  return {
    id,
    connectionTypeId,
    integrationType: "API",
    category: "notify",
    labelKey: `${PREFIX}.${id}.label`,
    descriptionKey: `${PREFIX}.${id}.description`,
    searchTerms,
    call: {
      // The webhook URL is the whole endpoint, so the step adds no path of its own.
      path: "",
      bodyMode: "json",
      includeFile: false,
      bodyTemplate: JSON.stringify({ [bodyKey]: "{{message}}" }),
    },
    fields: [
      {
        key: "message",
        labelKey: `${PREFIX}.fields.message.label`,
        control: "textarea",
        required: true,
        helperTextKey: `${PREFIX}.fields.message.helperText`,
        defaultValue:
          "{{run.policyName}} processed {{document.filename}} ({{document.pageCount}} pages)",
      },
    ],
  };
}

export const STEP_OPERATIONS: StepOperation[] = [
  // ---- scan & classify: the verdict gates the run ------------------------------------------
  {
    id: "cloudmersiveScan",
    connectionTypeId: "cloudmersive",
    integrationType: "API",
    category: "security",
    labelKey: `${PREFIX}.cloudmersiveScan.label`,
    descriptionKey: `${PREFIX}.cloudmersiveScan.description`,
    searchTerms: ["virus", "malware", "scan", "av", "antivirus"],
    // Verified against the live API: a clean PDF returns {"CleanResult":true}. The verdict gates
    // the run - CleanResult=false fails the step even though the HTTP status is 200.
    call: {
      path: "/virus/scan/file",
      bodyMode: "multipart",
      fileFieldName: "inputFile",
      responseMode: "report",
      requireTrue: "CleanResult",
    },
  },
  {
    id: "cloudmersiveAdvancedScan",
    connectionTypeId: "cloudmersiveadvanced",
    integrationType: "API",
    category: "security",
    labelKey: `${PREFIX}.cloudmersiveAdvancedScan.label`,
    descriptionKey: `${PREFIX}.cloudmersiveAdvancedScan.description`,
    searchTerms: [
      "macro",
      "executable",
      "script",
      "active content",
      "ole",
      "scan",
    ],
    // The block-list is expressed as headers; each defaults to false, i.e. blocking is ON. The
    // CleanResult verdict gates the run, so a blocked file stops the pipeline rather than passing.
    call: {
      path: "/virus/scan/file/advanced",
      bodyMode: "multipart",
      fileFieldName: "inputFile",
      responseMode: "report",
      requireTrue: "CleanResult",
      headers: {
        allowExecutables: "false",
        allowMacros: "false",
        allowScripts: "false",
        allowUnsafeArchives: "false",
        allowOleEmbeddedObject: "false",
      },
    },
  },
  {
    id: "clamavScan",
    connectionTypeId: "clamav",
    integrationType: "API",
    category: "security",
    labelKey: `${PREFIX}.clamavScan.label`,
    descriptionKey: `${PREFIX}.clamavScan.description`,
    searchTerms: ["virus", "malware", "scan", "self-hosted", "on-prem"],
    // Verified against a real ClamAV container: an infected file answers non-2xx, failing the step.
    call: {
      path: "/scan",
      bodyMode: "multipart",
      fileFieldName: "file",
      responseMode: "report",
    },
  },
  {
    id: "presidioAnalyze",
    connectionTypeId: "presidio",
    integrationType: "API",
    category: "security",
    labelKey: `${PREFIX}.presidioAnalyze.label`,
    descriptionKey: `${PREFIX}.presidioAnalyze.description`,
    searchTerms: ["pii", "personal data", "dlp", "gdpr", "detect"],
    noteKey: `${PREFIX}.presidioAnalyze.note`,
    // Presidio's analyser takes text, not a file - so the document is described, not uploaded.
    call: {
      path: "/analyze",
      bodyMode: "json",
      includeFile: false,
      responseMode: "report",
      bodyTemplate: JSON.stringify({ text: "{{text}}", language: "en" }),
    },
    fields: [
      {
        key: "text",
        labelKey: `${PREFIX}.fields.text.label`,
        control: "textarea",
        required: true,
        helperTextKey: `${PREFIX}.fields.text.helperText`,
      },
    ],
  },

  // ---- file & attach ------------------------------------------------------------------------
  {
    id: "jiraAttach",
    connectionTypeId: "jira",
    integrationType: "API",
    category: "storage",
    labelKey: `${PREFIX}.jiraAttach.label`,
    descriptionKey: `${PREFIX}.jiraAttach.description`,
    searchTerms: ["jira", "issue", "ticket", "attach", "atlassian"],
    // Verified against a real Jira Cloud site. The anti-XSRF header is mandatory.
    call: {
      path: "/rest/api/3/issue/{{issueKey}}/attachments",
      bodyMode: "multipart",
      fileFieldName: "file",
      responseMode: "report",
      headers: { "X-Atlassian-Token": "no-check" },
    },
    fields: [f("issueKey")],
  },
  {
    id: "confluenceAttach",
    connectionTypeId: "confluence",
    integrationType: "API",
    category: "storage",
    labelKey: `${PREFIX}.confluenceAttach.label`,
    descriptionKey: `${PREFIX}.confluenceAttach.description`,
    searchTerms: ["confluence", "page", "wiki", "attach", "atlassian"],
    // Verified against a real Confluence site. Note "nocheck" here vs Jira's "no-check", and that
    // only the v1 API can create an attachment.
    call: {
      path: "/wiki/rest/api/content/{{pageId}}/child/attachment",
      bodyMode: "multipart",
      fileFieldName: "file",
      responseMode: "report",
      headers: { "X-Atlassian-Token": "nocheck" },
      fields: { minorEdit: "true" },
    },
    fields: [f("pageId")],
  },
  {
    id: "nextcloudUpload",
    connectionTypeId: "nextcloud",
    integrationType: "API",
    category: "storage",
    labelKey: `${PREFIX}.nextcloudUpload.label`,
    descriptionKey: `${PREFIX}.nextcloudUpload.description`,
    searchTerms: ["nextcloud", "webdav", "upload", "file", "owncloud"],
    // Verified byte-identical against a real Nextcloud: WebDAV takes the raw bytes on a PUT.
    call: {
      path: "/remote.php/dav/files/{{username}}/{{remotePath}}",
      method: "PUT",
      bodyMode: "binary",
      responseMode: "report",
    },
    fields: [
      f("username"),
      {
        key: "remotePath",
        labelKey: `${PREFIX}.fields.remotePath.label`,
        control: "text",
        required: true,
        helperTextKey: `${PREFIX}.fields.remotePath.helperText`,
        defaultValue: "Processed/{{document.filename}}",
      },
    ],
  },

  // ---- audit & compliance logging -------------------------------------------------------------
  {
    id: "splunkEvent",
    connectionTypeId: "splunk",
    integrationType: "API",
    category: "audit",
    labelKey: `${PREFIX}.splunkEvent.label`,
    descriptionKey: `${PREFIX}.splunkEvent.description`,
    searchTerms: ["splunk", "hec", "siem", "audit", "log", "event"],
    // Verified against a real Splunk HEC; the event was found by Splunk's own search.
    call: {
      path: "/services/collector/event",
      bodyMode: "json",
      includeFile: false,
      responseMode: "report",
      bodyTemplate: JSON.stringify({
        sourcetype: "stirling:policy",
        event: {
          action: "policy.document.processed",
          policy: "{{run.policyName}}",
          runId: "{{run.runId}}",
          filename: "{{document.filename}}",
          sha256: "{{document.sha256}}",
          pages: "{{document.pageCount}}",
        },
      }),
    },
  },
  {
    id: "elasticIndex",
    connectionTypeId: "elastic",
    integrationType: "API",
    category: "audit",
    labelKey: `${PREFIX}.elasticIndex.label`,
    descriptionKey: `${PREFIX}.elasticIndex.description`,
    searchTerms: ["elastic", "elasticsearch", "siem", "audit", "index", "log"],
    // Verified against a real Elasticsearch: the event was queried back out afterwards.
    call: {
      path: "/{{index}}/_doc",
      bodyMode: "json",
      includeFile: false,
      responseMode: "report",
      bodyTemplate: JSON.stringify({
        event: "policy.document.processed",
        policy: "{{run.policyName}}",
        runId: "{{run.runId}}",
        filename: "{{document.filename}}",
        sha256: "{{document.sha256}}",
      }),
    },
    fields: [
      {
        key: "index",
        labelKey: `${PREFIX}.fields.index.label`,
        control: "text",
        required: true,
        defaultValue: "stirling-audit",
      },
    ],
  },
  {
    id: "sumologicEvent",
    connectionTypeId: "sumologic",
    integrationType: "API",
    category: "audit",
    labelKey: `${PREFIX}.sumologicEvent.label`,
    descriptionKey: `${PREFIX}.sumologicEvent.description`,
    searchTerms: ["sumo", "sumologic", "siem", "audit", "log"],
    call: {
      path: "",
      bodyMode: "json",
      includeFile: false,
      responseMode: "report",
      bodyTemplate: JSON.stringify({
        event: "policy.document.processed",
        policy: "{{run.policyName}}",
        filename: "{{document.filename}}",
        sha256: "{{document.sha256}}",
      }),
    },
  },

  // ---- email the document ----------------------------------------------------------------------
  {
    id: "sendgridEmail",
    connectionTypeId: "sendgrid",
    integrationType: "API",
    category: "notify",
    labelKey: `${PREFIX}.sendgridEmail.label`,
    descriptionKey: `${PREFIX}.sendgridEmail.description`,
    searchTerms: ["email", "mail", "send", "attachment", "sendgrid"],
    call: {
      path: "/v3/mail/send",
      bodyMode: "json",
      responseMode: "report",
      bodyTemplate: JSON.stringify({
        personalizations: [{ to: [{ email: "{{to}}" }] }],
        from: { email: "{{from}}" },
        subject: "{{subject}}",
        content: [
          { type: "text/plain", value: "Attached: {{document.filename}}" },
        ],
        attachments: [
          {
            content: "{{document.base64}}",
            filename: "{{document.filename}}",
            type: "application/pdf",
            disposition: "attachment",
          },
        ],
      }),
    },
    fields: [
      f("to"),
      f("from"),
      {
        key: "subject",
        labelKey: `${PREFIX}.fields.subject.label`,
        control: "text",
        required: true,
        defaultValue: "Processed: {{document.filename}}",
      },
    ],
  },
  {
    id: "mailgunEmail",
    connectionTypeId: "mailgun",
    integrationType: "API",
    category: "notify",
    labelKey: `${PREFIX}.mailgunEmail.label`,
    descriptionKey: `${PREFIX}.mailgunEmail.description`,
    searchTerms: ["email", "mail", "send", "attachment", "mailgun"],
    call: {
      path: "/v3/{{domain}}/messages",
      bodyMode: "multipart",
      fileFieldName: "attachment",
      responseMode: "report",
      responseSelect: "id",
      fields: {
        from: "{{from}}",
        to: "{{to}}",
        subject: "{{subject}}",
        text: "Attached: {{document.filename}}",
      },
    },
    fields: [
      f("domain"),
      f("to"),
      f("from"),
      {
        key: "subject",
        labelKey: `${PREFIX}.fields.subject.label`,
        control: "text",
        required: true,
        defaultValue: "Processed: {{document.filename}}",
      },
    ],
  },

  // ---- notify: one shape, several vendors -------------------------------------------------------
  notify("slackNotify", "slack", "text", [
    "slack",
    "chat",
    "notify",
    "message",
  ]),
  notify("teamsNotify", "teams", "text", [
    "teams",
    "microsoft",
    "chat",
    "notify",
  ]),
  notify("discordNotify", "discord", "content", ["discord", "chat", "notify"]),
  notify("googlechatNotify", "googlechat", "text", [
    "google",
    "chat",
    "notify",
  ]),
  notify("zapierNotify", "zapier", "text", [
    "zapier",
    "make",
    "automation",
    "trigger",
  ]),

  {
    id: "webhookPost",
    connectionTypeId: "webhook",
    integrationType: "API",
    category: "notify",
    labelKey: `${PREFIX}.webhookPost.label`,
    descriptionKey: `${PREFIX}.webhookPost.description`,
    searchTerms: ["webhook", "http", "post", "callback", "custom"],
    call: {
      path: "",
      bodyMode: "multipart",
      fileFieldName: "file",
      responseMode: "report",
    },
  },

  // ---- sign ---------------------------------------------------------------------------------------
  {
    id: "consignoSubmit",
    connectionTypeId: "consigno",
    integrationType: "CONSIGNO",
    category: "signing",
    labelKey: `${PREFIX}.consignoSubmit.label`,
    descriptionKey: `${PREFIX}.consignoSubmit.description`,
    searchTerms: ["consigno", "notarius", "sign", "signature", "esign"],
    noteKey: `${PREFIX}.consignoSubmit.note`,
    call: {
      path: "/workflows",
      bodyMode: "json",
      responseMode: "report",
      bodyTemplate: JSON.stringify({
        name: "{{document.filename}}",
        documents: [
          { name: "{{document.filename}}", data: "{{document.base64}}" },
        ],
        signers: [{ email: "{{signerEmail}}", type: "certifio" }],
      }),
    },
    fields: [f("signerEmail")],
  },

  // ---- the escape hatch ---------------------------------------------------------------------------
  {
    id: "customApiCall",
    connectionTypeId: "api",
    integrationType: "API",
    category: "advanced",
    labelKey: `${PREFIX}.customApiCall.label`,
    descriptionKey: `${PREFIX}.customApiCall.description`,
    searchTerms: ["custom", "api", "http", "advanced", "anything"],
    custom: true,
    // Nothing baked in: every part of the call is the operator's to author.
    call: {
      path: "",
      bodyMode: "multipart",
      fileFieldName: "file",
      responseMode: "report",
    },
  },
];

/** Operations grouped for the picker, in the catalogue's own category order. */
export function operationsByCategory(
  operations: StepOperation[],
): Map<ConnectionCategory, StepOperation[]> {
  const map = new Map<ConnectionCategory, StepOperation[]>();
  for (const op of operations) {
    const list = map.get(op.category) ?? [];
    list.push(op);
    map.set(op.category, list);
  }
  return map;
}

/** Matches label, description and the vendor's own aliases, like the connection picker. */
export function searchOperations(
  operations: StepOperation[],
  query: string,
  t: (key: string) => string,
): StepOperation[] {
  const q = query.trim().toLowerCase();
  if (!q) return operations;
  return operations.filter((op) => {
    const haystack = [
      t(op.labelKey),
      t(op.descriptionKey),
      op.id,
      ...(op.searchTerms ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** The operator-supplied defaults for a freshly chosen operation. */
export function emptyOperationValues(
  op: StepOperation,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of op.fields ?? []) {
    values[field.key] = field.defaultValue ?? "";
  }
  return values;
}

export function operationFormValid(
  op: StepOperation,
  values: Record<string, string>,
): boolean {
  return (op.fields ?? []).every(
    (field) => !field.required || (values[field.key] ?? "").trim() !== "",
  );
}

/**
 * Turn a chosen operation plus the operator's answers into the parameters the
 * `external-api-call` step takes.
 *
 * Operator values are substituted into the call's own `{{placeholders}}` here, in the client,
 * because they are step configuration rather than per-document context. The backend's placeholder
 * pass then resolves the remaining `{{document.*}}` and `{{run.*}}` at run time, per document.
 */
export function buildStepParameters(
  op: StepOperation,
  connectionId: string,
  values: Record<string, string>,
): ExternalApiStepParams {
  // Substituted into the URL path: the answer is percent-encoded, so a space or slash in a key
  // (a Jira "OPS 1", a path-shaped id) is a value, not a change to the target. Matches the
  // backend's URL_PATH escaping for its own {{document.*}} pass.
  const substitutePath = (text: string): string =>
    text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (whole, key: string) =>
      key in values ? encodeURIComponent(values[key]) : whole,
    );
  // Substituted into an already-serialised JSON string: a quote or backslash in an answer would
  // otherwise break the body, and the backend rejects it as invalid JSON.
  const substituteJson = (text: string): string =>
    text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (whole, key: string) =>
      key in values ? JSON.stringify(values[key]).slice(1, -1) : whole,
    );

  const call = op.call;
  // Every declared parameter is emitted, blank where the operation does not use it, so the result
  // is a complete step rather than a partial one the caller has to top up.
  return {
    connectionId,
    path: substitutePath(call.path ?? ""),
    method: call.method ?? "POST",
    bodyMode: call.bodyMode ?? "multipart",
    fileFieldName: call.fileFieldName ?? "file",
    responseMode: call.responseMode ?? "report",
    responseSelect: call.responseSelect ?? "",
    requireTrue: call.requireTrue ?? "",
    resultUrlPath: "",
    resultUrlHeader: "",
    headers: call.headers ? substituteJson(JSON.stringify(call.headers)) : "",
    fields: call.fields ? substituteJson(JSON.stringify(call.fields)) : "",
    bodyTemplate: call.bodyTemplate ? substituteJson(call.bodyTemplate) : "",
    includeContext: "false",
    includeFile: String(call.includeFile ?? true),
    operationId: op.id,
    operationValues: JSON.stringify(values),
  };
}

export function operationById(id: string): StepOperation | undefined {
  return STEP_OPERATIONS.find((op) => op.id === id);
}
