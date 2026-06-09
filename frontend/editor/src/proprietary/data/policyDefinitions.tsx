/**
 * Static preset definitions for Policies — the categories, their editable
 * settings fields, scope labels, and the default tool pipeline each category
 * seeds a new policy with. Runtime activity + stats are derived live from the
 * user's real files (see policyLiveData), not defined here.
 */

import LayersIcon from "@mui/icons-material/Layers";
import ShieldIcon from "@mui/icons-material/Shield";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import StorageIcon from "@mui/icons-material/Storage";
import DescriptionIcon from "@mui/icons-material/Description";
import ComputerIcon from "@mui/icons-material/Computer";
import PublicIcon from "@mui/icons-material/Public";
import CloudIcon from "@mui/icons-material/Cloud";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import type {
  PolicyCategory,
  PolicyConfigDef,
  PolicySource,
} from "@app/types/policies";

const ICON_SX = { fontSize: "1rem" } as const;

/** The 5 policy categories, in the prototype's narrative order. */
export const POLICY_CATEGORIES: PolicyCategory[] = [
  {
    id: "ingestion",
    label: "Ingestion",
    icon: <LayersIcon sx={ICON_SX} />,
    desc: "Classify documents, extract structured data, enforce naming conventions, and normalize pages.",
    // The classifier the wizard's "Set up Classification" action routes to.
    providesClassification: true,
  },
  {
    id: "security",
    label: "Security",
    icon: <ShieldIcon sx={ICON_SX} />,
    desc: "Detect PII, encrypt, verify authenticity, control access, and certify documents.",
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: <CheckCircleIcon sx={ICON_SX} />,
    desc: "Enforce HIPAA, GDPR, SOC 2, or FedRAMP requirements on every document.",
  },
  {
    id: "routing",
    label: "Routing",
    icon: <ArrowForwardIcon sx={ICON_SX} />,
    desc: "Auto-route documents to the right team, folder, or system.",
  },
  {
    id: "retention",
    label: "Retention",
    icon: <StorageIcon sx={ICON_SX} />,
    desc: "Set how long documents are kept, when to archive, and when to delete.",
  },
];

/**
 * Default PII regexes a fresh Security policy redacts out of the box — the
 * high-risk set (SSN, payment-card, bank-account numbers) pre-selected per the
 * design. They seed the redact step's `wordsToRedact` (with `useRegex`); users
 * edit them in the Redact tool's settings.
 */
export const DEFAULT_PII_PATTERNS: string[] = [
  "\\b\\d{3}-\\d{2}-\\d{4}\\b", // US Social Security number
  "\\b(?:\\d[ -]*?){13,16}\\b", // payment-card numbers (13–16 digits)
  "\\b\\d{8,17}\\b", // bank account numbers (8–17 digits)
];

/** Per-category narrative + editable fields (from the prototype's POLICY_CONFIG). */
export const POLICY_CONFIG: Record<string, PolicyConfigDef> = {
  ingestion: {
    summary:
      "Classifies documents, extracts structured data, enforces naming, and normalizes pages.",
    rules: ["Classify", "Extract", "Name", "Normalize"],
    defaultOperations: [
      { operation: "ocr", parameters: {} },
      { operation: "flatten", parameters: {} },
    ],
    scopeLabel: "All PDFs on this device",
    // Policy-level controls only — the per-tool params (OCR level, extract
    // tables, naming, normalize, rotate…) now live in the Workflow step.
    fields: [
      {
        label: "Min confidence",
        key: "minConfidence",
        type: "select",
        value: "80%",
        options: ["60%", "70%", "80%", "90%", "95%"],
      },
      {
        label: "Below threshold",
        key: "belowThreshold",
        type: "select",
        value: "Flag for review",
        options: ["Flag for review", "Route to bucket", "Hold"],
      },
    ],
  },
  security: {
    summary:
      "Detects PII, encrypts, verifies authenticity, controls access, and certifies documents.",
    rules: ["Redact PII", "Remove JavaScript"],
    // Default chain: redact PII + remove JavaScript (via sanitize) on; watermark
    // is offered in the config page but off by default (not seeded here). Redact
    // ships with the high-risk PII regexes so it works out of the box.
    defaultOperations: [
      {
        operation: "redact",
        parameters: {
          mode: "automatic",
          useRegex: true,
          wordsToRedact: DEFAULT_PII_PATTERNS,
        },
      },
      { operation: "sanitize", parameters: {} },
    ],
    scopeLabel: "All PDFs on this device",
    // Policy-level controls only — detection/encryption/signing/watermark are
    // per-tool and now live in the Workflow step.
    fields: [
      {
        label: "Default PII response",
        key: "defaultResponse",
        type: "select",
        value: "Highlight & tag",
        options: [
          "Highlight & tag",
          "Prompt on export",
          "Auto-redact on export",
          "Block export",
        ],
      },
      {
        label: "User can override",
        key: "userOverride",
        type: "toggle",
        value: true,
      },
      {
        label: "Default access level",
        key: "defaultAccess",
        type: "select",
        value: "Restricted",
        options: ["Open", "Restricted", "Confidential", "Top Secret"],
      },
      {
        label: "Block external sharing",
        key: "blockExternal",
        type: "toggle",
        value: false,
      },
    ],
  },
  compliance: {
    summary:
      "Validates documents against regulatory frameworks before they leave the system.",
    rules: ["Framework scan", "Enforce action", "Audit trail"],
    defaultOperations: [
      { operation: "sanitize", parameters: {} },
      { operation: "flatten", parameters: {} },
    ],
    scopeLabel: "All PDFs on this device",
    fields: [
      {
        label: "Frameworks",
        key: "frameworks",
        type: "chips",
        value: ["HIPAA"],
        options: [
          "HIPAA",
          "GDPR",
          "SOC 2",
          "FedRAMP",
          "PCI DSS",
          "CCPA",
          "ISO 27001",
        ],
      },
      {
        label: "When non-compliant",
        key: "onViolation",
        type: "select",
        value: "Flag for review",
        options: [
          "Flag for review",
          "Block export",
          "Auto-redact PHI",
          "Quarantine document",
        ],
      },
      { label: "Audit trail", key: "auditTrail", type: "toggle", value: true },
      { label: "Access log", key: "accessLog", type: "toggle", value: true },
    ],
  },
  routing: {
    summary:
      "Routes documents to the right destination based on type and classification.",
    rules: ["Auto-classify", "Route to folder", "Webhook notify"],
    defaultOperations: [{ operation: "compress", parameters: {} }],
    scopeLabel: "All PDFs on this device",
    fields: [
      {
        label: "Destination",
        key: "destination",
        type: "select",
        value: "Documents",
        options: ["Documents", "S3 bucket", "SharePoint", "Webhook"],
      },
      { label: "Webhook URL", key: "webhookUrl", type: "text", value: "" },
      { label: "Notify on route", key: "notify", type: "toggle", value: false },
    ],
  },
  retention: {
    summary:
      "Enforces how long documents are kept, when to archive, and when to delete.",
    rules: ["Retention hold", "Auto-archive", "Deletion block"],
    defaultOperations: [{ operation: "compress", parameters: {} }],
    scopeLabel: "All PDFs on this device",
    fields: [
      {
        label: "Keep for",
        key: "keepFor",
        type: "select",
        value: "7 years",
        options: ["30 days", "1 year", "3 years", "7 years", "Indefinite"],
      },
      {
        label: "Archive after",
        key: "archiveAfter",
        type: "select",
        value: "Never",
        options: ["30 days", "90 days", "1 year", "Never"],
      },
      {
        label: "Immutable hold",
        key: "immutableHold",
        type: "toggle",
        value: false,
      },
    ],
  },
};

/** Sources a policy can run over (wizard step 2). */
export const POLICY_SOURCES: PolicySource[] = [
  {
    id: "editor",
    label: "Editor",
    desc: "Documents you save or export in Stirling",
    icon: <DescriptionIcon sx={ICON_SX} />,
  },
  {
    id: "device",
    label: "Entire device",
    desc: "All PDFs on this machine, retroactively",
    icon: <ComputerIcon sx={ICON_SX} />,
  },
  {
    id: "sharepoint",
    label: "SharePoint",
    desc: "Connected SharePoint libraries",
    icon: <PublicIcon sx={ICON_SX} />,
  },
  {
    id: "dropbox",
    label: "Dropbox",
    desc: "Connected Dropbox folders",
    icon: <CloudIcon sx={ICON_SX} />,
  },
  {
    id: "gmail",
    label: "Gmail",
    desc: "PDF attachments in email",
    icon: <EmailOutlinedIcon sx={ICON_SX} />,
  },
  {
    id: "gdrive",
    label: "Google Drive",
    desc: "Connected Drive folders",
    icon: <FolderOpenIcon sx={ICON_SX} />,
  },
];

/** Document types selectable when narrowing scope (gated behind classification). */
export const POLICY_DOC_TYPES: string[] = [
  "Contracts",
  "Invoices",
  "Tax documents",
  "HR records",
  "Insurance",
  "Medical / PHI",
  "Legal filings",
  "Financial reports",
];

