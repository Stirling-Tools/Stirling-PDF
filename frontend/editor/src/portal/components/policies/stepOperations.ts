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
import {
  VARIABLE_GROUPS,
  unknownReferences,
  type VariableGroup,
} from "@portal/components/policies/variables";

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
  maxRequestBytes: string;
  operationId: string;
  operationValues: string;
}

const PREFIX = "portal.policies.operations";

/** One value the operator supplies per step, substituted into the call. */
export interface OperationFieldDef {
  key: string;
  labelKey: string;
  /** "number" is a plain numeric input: no variables, validated as a positive number. */
  control: "text" | "textarea" | "select" | "number";
  required?: boolean;
  placeholderKey?: string;
  helperTextKey?: string;
  defaultValue?: string;
  options?: { value: string; labelKey: string }[];
  /**
   * True when the value is a path whose slashes are separators (Nextcloud's remotePath), so
   * substitutePath encodes each segment rather than the whole value.
   */
  pathValue?: boolean;
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
  /**
   * Names the operator field (in MB) that caps the document size for this call, for destinations
   * with an upload limit the operator alone knows (a Discord channel's, which its Nitro tier sets).
   * The step fails before dispatch when the document is over it, rather than the vendor rejecting it.
   */
  maxBytesFromField?: string;
  /** Send the fact context beside the document so the receiver can branch on the run.
   * Off by default: a vendor with a fixed API has no field for it. */
  includeContext?: boolean;
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

/** Facts every document has, whatever its type — `document.pageCount` is PDF-only and would
 * fail the step on anything else, so it is offered in the editable message rather than baked in. */
const N8N_FACTS = {
  event: "policy.document.processed",
  run: {
    policy: "{{run.policyName}}",
    id: "{{run.runId}}",
    at: "{{run.timestamp}}",
  },
  document: {
    filename: "{{document.filename}}",
    extension: "{{document.extension}}",
    contentType: "{{document.contentType}}",
    sizeBytes: "{{document.sizeBytes}}",
    sha256: "{{document.sha256}}",
  },
};

/** The four shapes an n8n workflow can take part in; see the catalogue entry for why n8n gets more
 * than one. All four post to the Webhook node's URL, which is the whole endpoint. */
function n8nOperations(): StepOperation[] {
  const base = {
    connectionTypeId: "n8n",
    integrationType: "API" as const,
    category: "notify" as const,
  };
  const entry = (
    id: string,
    call: OperationCall,
    extra: Partial<StepOperation> = {},
  ) => ({
    ...base,
    id,
    labelKey: `${PREFIX}.${id}.label`,
    descriptionKey: `${PREFIX}.${id}.description`,
    call,
    ...extra,
  });

  return [
    // Facts only, structured rather than one text blob: a workflow branches on
    // fields instead of parsing a sentence back apart.
    entry(
      "n8nNotify",
      {
        path: "",
        bodyMode: "json",
        includeFile: false,
        bodyTemplate: JSON.stringify({ ...N8N_FACTS, message: "{{message}}" }),
      },
      {
        searchTerms: ["n8n", "notify", "trigger", "workflow", "automation"],
        fields: [
          {
            key: "message",
            labelKey: `${PREFIX}.fields.message.label`,
            control: "textarea",
            required: true,
            helperTextKey: `${PREFIX}.fields.message.helperText`,
            defaultValue: "{{run.policyName}} processed {{document.filename}}",
          },
        ],
      },
    ),

    // The document itself, plus the facts as a `stirlingContext` part so the workflow knows which
    // policy sent it. Fire-and-forget: whatever n8n replies is recorded, the document is unchanged.
    entry(
      "n8nSend",
      {
        path: "",
        bodyMode: "multipart",
        fileFieldName: "file",
        includeContext: true,
        responseMode: "report",
      },
      {
        searchTerms: ["n8n", "send", "file", "upload", "workflow", "binary"],
      },
    ),

    // The round trip: the returned file replaces the one in the pipeline. Needs the Webhook node
    // set to "Respond to Webhook" - on "Immediately" its acknowledgement would replace the document.
    entry(
      "n8nTransform",
      {
        path: "",
        bodyMode: "multipart",
        fileFieldName: "file",
        includeContext: true,
        responseMode: "replace",
      },
      {
        searchTerms: [
          "n8n",
          "transform",
          "process",
          "convert",
          "workflow",
          "replace",
        ],
        noteKey: `${PREFIX}.n8nTransform.note`,
      },
    ),

    // The workflow decides whether the run continues. `requireTrue` is fail-closed, so an n8n
    // outage or a malformed reply parks the document rather than waving it through.
    entry(
      "n8nGate",
      {
        path: "",
        bodyMode: "multipart",
        fileFieldName: "file",
        includeContext: true,
        responseMode: "report",
        requireTrue: "approved",
      },
      {
        searchTerms: [
          "n8n",
          "approve",
          "gate",
          "review",
          "decision",
          "workflow",
        ],
        noteKey: `${PREFIX}.n8nGate.note`,
      },
    ),
  ];
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
    id: "jiraComment",
    connectionTypeId: "jira",
    integrationType: "API",
    category: "storage",
    labelKey: `${PREFIX}.jiraComment.label`,
    descriptionKey: `${PREFIX}.jiraComment.description`,
    searchTerms: ["jira", "comment", "note", "atlassian", "issue"],
    // Jira Cloud v3 wants the comment body as Atlassian Document Format, not plain text. No file:
    // this records a note on the issue, so the document flows on untouched.
    call: {
      path: "/rest/api/3/issue/{{issueKey}}/comment",
      bodyMode: "json",
      includeFile: false,
      responseMode: "report",
      bodyTemplate: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "{{message}}" }],
            },
          ],
        },
      }),
    },
    fields: [
      f("issueKey"),
      {
        key: "message",
        labelKey: `${PREFIX}.fields.message.label`,
        control: "textarea",
        required: true,
        helperTextKey: `${PREFIX}.fields.message.helperText`,
        defaultValue: "{{run.policyName}} processed {{document.filename}}",
      },
    ],
  },
  {
    id: "jiraTransition",
    connectionTypeId: "jira",
    integrationType: "API",
    category: "storage",
    labelKey: `${PREFIX}.jiraTransition.label`,
    descriptionKey: `${PREFIX}.jiraTransition.description`,
    searchTerms: ["jira", "transition", "status", "workflow", "move", "done"],
    noteKey: `${PREFIX}.jiraTransition.note`,
    // A transition is named by its id, not the target status; GET .../transitions lists them.
    call: {
      path: "/rest/api/3/issue/{{issueKey}}/transitions",
      bodyMode: "json",
      includeFile: false,
      responseMode: "report",
      bodyTemplate: JSON.stringify({ transition: { id: "{{transitionId}}" } }),
    },
    fields: [f("issueKey"), f("transitionId")],
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
        pathValue: true,
      },
    ],
  },
  {
    id: "nextcloudShareLink",
    connectionTypeId: "nextcloud",
    integrationType: "API",
    category: "storage",
    labelKey: `${PREFIX}.nextcloudShareLink.label`,
    descriptionKey: `${PREFIX}.nextcloudShareLink.description`,
    searchTerms: ["nextcloud", "share", "link", "public", "url", "owncloud"],
    noteKey: `${PREFIX}.nextcloudShareLink.note`,
    // Shares a file already in Nextcloud (e.g. one an upload step wrote); no document is sent.
    // The OCS link comes back at ocs.data.url, so a later step reads {{steps.N.body.ocs.data.url}}.
    call: {
      path: "/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json",
      bodyMode: "multipart",
      includeFile: false,
      responseMode: "report",
      headers: { "OCS-APIRequest": "true" },
      fields: { path: "{{remotePath}}", shareType: "3" },
    },
    fields: [
      {
        key: "remotePath",
        labelKey: `${PREFIX}.fields.shareRemotePath.label`,
        control: "text",
        required: true,
        placeholderKey: `${PREFIX}.fields.shareRemotePath.placeholder`,
        helperTextKey: `${PREFIX}.fields.shareRemotePath.helperText`,
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

  // ---- n8n: the one vendor here that can answer back ---------------------------------------------
  // A Webhook node takes binary and can return what the workflow produces, so n8n reaches all three
  // engine modes - report, replace and a `requireTrue` verdict - and gets an operation for each.
  ...n8nOperations(),

  {
    id: "discordAttach",
    connectionTypeId: "discord",
    integrationType: "API",
    category: "notify",
    labelKey: `${PREFIX}.discordAttach.label`,
    descriptionKey: `${PREFIX}.discordAttach.description`,
    searchTerms: ["discord", "attach", "file", "upload", "document", "chat"],
    noteKey: `${PREFIX}.discordAttach.note`,
    // Discord webhooks take a multipart upload: the file under files[0], the caption in payload_json.
    // The size cap is a field, not baked in, because a channel's limit rises with its Nitro tier.
    call: {
      path: "",
      bodyMode: "multipart",
      fileFieldName: "files[0]",
      responseMode: "report",
      includeFile: true,
      maxBytesFromField: "maxFileMb",
      fields: { payload_json: JSON.stringify({ content: "{{message}}" }) },
    },
    fields: [
      {
        key: "message",
        labelKey: `${PREFIX}.fields.message.label`,
        control: "textarea",
        required: false,
        helperTextKey: `${PREFIX}.fields.message.helperText`,
        defaultValue: "{{run.policyName}} processed {{document.filename}}",
      },
      {
        key: "maxFileMb",
        labelKey: `${PREFIX}.fields.maxFileMb.label`,
        control: "number",
        required: false,
        helperTextKey: `${PREFIX}.fields.maxFileMb.helperText`,
        defaultValue: "25",
      },
    ],
  },

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

/** Why a field's current value cannot be saved, or null when it can. */
export type OperationFieldIssue =
  | { kind: "number" }
  | { kind: "reference"; path: string };

/**
 * Save-time validation for one operator field. A number field must be blank (no cap) or a
 * positive number - silently coercing "abc" to "no cap" would fail open on a safeguard. A text
 * field's `{{references}}` must all be ones the run can fill in, because the backend hard-fails
 * an unknown path on every run.
 */
export function operationFieldIssue(
  field: OperationFieldDef,
  value: string,
  groups: VariableGroup[] = VARIABLE_GROUPS,
  stepPosition?: number,
): OperationFieldIssue | null {
  if (field.control === "number") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? null : { kind: "number" };
  }
  if (field.control === "select") return null;
  const unknown = unknownReferences(value, groups, stepPosition);
  return unknown.length > 0 ? { kind: "reference", path: unknown[0] } : null;
}

export function operationFormValid(
  op: StepOperation,
  values: Record<string, string>,
  groups: VariableGroup[] = VARIABLE_GROUPS,
  stepPosition?: number,
): boolean {
  return (op.fields ?? []).every(
    (field) =>
      (!field.required || (values[field.key] ?? "").trim() !== "") &&
      operationFieldIssue(
        field,
        values[field.key] ?? "",
        groups,
        stepPosition,
      ) === null,
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
  const fieldsByKey = new Map(
    (op.fields ?? []).map((field) => [field.key, field]),
  );
  // A {{document.*}}-style reference inside the answer must stay for the backend's own URL_PATH
  // pass, which resolves and percent-encodes its value at run time; encoding the braces here
  // would send the reference literally, never resolved.
  const encodePathAnswer = (text: string, segmented: boolean): string =>
    text
      .split(/(\{\{[\w.]+\}\})/g)
      .map((part) =>
        /^\{\{[\w.]+\}\}$/.test(part)
          ? part
          : segmented
            ? part.split("/").map(encodeURIComponent).join("/")
            : encodeURIComponent(part),
      )
      .join("");
  // Substituted into the URL path: the answer is percent-encoded, so a space or slash in a key
  // (a Jira "OPS 1", a path-shaped id) is a value, not a change to the target. Matches the
  // backend's URL_PATH escaping for its own {{document.*}} pass. A pathValue field keeps its
  // slashes as separators and encodes per segment instead.
  const substitutePath = (text: string): string =>
    text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (whole, key: string) =>
      key in values
        ? encodePathAnswer(
            values[key],
            fieldsByKey.get(key)?.pathValue === true,
          )
        : whole,
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
    includeContext: String(call.includeContext ?? false),
    includeFile: String(call.includeFile ?? true),
    maxRequestBytes: maxRequestBytes(call, values),
    operationId: op.id,
    operationValues: JSON.stringify(values),
  };
}

/**
 * The size cap in bytes for this call, from the operator's MB field, or "0" for no cap. Blank
 * deliberately means no cap; anything else non-positive or unparseable also yields "0" here, but
 * operationFieldIssue refuses to save it - coercing "abc" into "no cap" would fail open.
 */
function maxRequestBytes(
  call: OperationCall,
  values: Record<string, string>,
): string {
  if (!call.maxBytesFromField) return "0";
  const mb = Number.parseFloat(values[call.maxBytesFromField] ?? "");
  if (!Number.isFinite(mb) || mb <= 0) return "0";
  return String(Math.round(mb * 1024 * 1024));
}

/**
 * The first unresolvable reference across a custom call's operator-authored parameters, or null.
 * The custom operation has no fields; its path, headers and body template are typed directly, so
 * they get the same save-time reference check the field values do.
 */
export function customCallUnknownReference(
  params: Pick<ExternalApiStepParams, "path" | "headers" | "bodyTemplate">,
  groups: VariableGroup[] = VARIABLE_GROUPS,
  stepPosition?: number,
): string | null {
  for (const text of [params.path, params.headers, params.bodyTemplate]) {
    const unknown = unknownReferences(text ?? "", groups, stepPosition);
    if (unknown.length > 0) return unknown[0];
  }
  return null;
}

/** The operations a given connection type unlocks - what an integration lets you actually do. */
export function operationsForConnectionType(
  connectionTypeId: string,
): StepOperation[] {
  return STEP_OPERATIONS.filter(
    (op) => op.connectionTypeId === connectionTypeId,
  );
}

export function operationById(id: string): StepOperation | undefined {
  return STEP_OPERATIONS.find((op) => op.id === id);
}
