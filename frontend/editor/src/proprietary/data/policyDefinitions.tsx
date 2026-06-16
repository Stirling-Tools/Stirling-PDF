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

/** The 5 policy categories, in display order. */
export const POLICY_CATEGORIES: PolicyCategory[] = [
  {
    id: "ingestion",
    label: "Ingestion",
    icon: <LayersIcon sx={ICON_SX} />,
    desc: "Classify documents, extract structured data, enforce naming conventions, and normalize pages.",
    // The classifier the wizard's "Set up Classification" action routes to.
    providesClassification: true,
    // Needs the classify agent + RAG, which aren't built yet.
    comingSoon: true,
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
    comingSoon: true,
  },
  {
    id: "routing",
    label: "Routing",
    icon: <ArrowForwardIcon sx={ICON_SX} />,
    desc: "Auto-route documents to the right team, folder, or system.",
    comingSoon: true,
  },
  {
    id: "retention",
    label: "Retention",
    icon: <StorageIcon sx={ICON_SX} />,
    desc: "Set how long documents are kept, when to archive, and when to delete.",
    comingSoon: true,
  },
];

/**
 * PII presets for the redact step: a label + the regex the /auto-redact endpoint
 * matches (via `wordsToRedact` + `useRegex`). Patterns are precise — validated
 * (SSN areas, card IINs, ABA prefixes), context- or separator-anchored — to keep
 * false positives down and avoid catastrophic backtracking.
 */
export const PII_PRESETS: { value: string; label: string; pattern: string }[] =
  [
    {
      value: "ssn",
      label: "Social Security numbers",
      // 123-45-6789 or 123 45 6789; rejects invalid areas (000/666/9xx),
      // group 00, serial 0000, and mixed separators (backreference).
      pattern:
        "\\b(?!000|666|9\\d{2})\\d{3}([- ])(?!00)\\d{2}\\1(?!0000)\\d{4}\\b",
    },
    {
      value: "card",
      label: "Credit / debit cards",
      // Solid runs anchored to real IINs (Visa 13/16, MC 51–55 + 2221–2720,
      // Amex 34/37, Discover 6011/65xx) + grouped 4-4-4-4 and Amex 4-6-5
      // with a consistent separator enforced by backreference.
      pattern:
        "\\b(?:4\\d{12}(?:\\d{3})?|5[1-5]\\d{14}|(?:222[1-9]|22[3-9]\\d|2[3-6]\\d{2}|27[01]\\d|2720)\\d{12}|3[47]\\d{13}|6(?:011|5\\d{2})\\d{12}|[2-6]\\d{3}([ -])\\d{4}\\1\\d{4}\\1\\d{4}|3[47]\\d{2}([ -])\\d{6}\\2\\d{5})\\b",
    },
    {
      value: "iban",
      label: "IBANs",
      // Solid (GB29NWBK…) or space-grouped (GB29 NWBK 6016 …) form.
      pattern:
        "\\b[A-Z]{2}\\d{2}(?:[A-Z0-9]{11,30}|(?: [A-Z0-9]{4}){2,7}(?: [A-Z0-9]{1,4})?)\\b",
    },
    {
      value: "routing",
      label: "US routing numbers (ABA)",
      // 9 digits constrained to valid Federal Reserve prefix ranges.
      pattern: "\\b(?:0[1-9]|1[0-2]|2[1-9]|3[0-2]|6[1-9]|7[0-2]|80)\\d{7}\\b",
    },
    {
      value: "account",
      label: "Account numbers (labelled)",
      // Context-anchored: only digits preceded by Account / Acct / A/C.
      pattern:
        "\\b(?:[Aa]cc(?:oun)?t|[Aa]/[Cc])(?:\\s+(?:[Nn]o\\.?|[Nn]umber|#))?\\s*[:#]?\\s*\\d{6,17}\\b",
    },
    {
      value: "email",
      label: "Email addresses",
      // Requires a real TLD (≥2 letters); won't swallow a sentence-ending period.
      pattern:
        "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}\\b",
    },
    {
      value: "phone",
      label: "Phone numbers",
      // (555) 123-4567 · 555-123-4567 (consistent separator) · +E.164 solid or
      // grouped · UK 0-prefixed grouped formats. Bare 10-digit runs excluded.
      pattern:
        "\\(\\d{3}\\)[ .-]?\\d{3}[ .-]?\\d{4}\\b|\\b\\d{3}([ .-])\\d{3}\\1\\d{4}\\b|\\+\\d{1,3}[ .-]?\\d{6,12}\\b|\\+\\d{1,3}(?:[ .-]\\d{2,4}){2,5}\\b|\\b0\\d{2,4}[ -]\\d{3,4}[ -]?\\d{3,4}\\b",
    },
  ];

/**
 * Defaults seeded into a fresh Security policy's redact step — only the two
 * strictest, precise patterns (SSN + cards). Users add the rest (IBAN, routing,
 * account, email, phone) from the PII dropdown.
 */
export const DEFAULT_PII_PATTERNS: string[] = [
  PII_PRESETS[0].pattern, // SSN
  PII_PRESETS[1].pattern, // cards
];

/** Per-category narrative + editable fields. */
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
    // tables, naming, normalize, rotate...) live in the Workflow step.
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
          // Flatten to image so redacted text is truly removed, not just hidden
          // behind a box (heavier, but real redaction).
          convertPDFToImage: true,
          wordsToRedact: DEFAULT_PII_PATTERNS,
        },
      },
      {
        // Sanitize is fixed to JavaScript removal only (no per-policy config).
        operation: "sanitize",
        parameters: {
          removeJavaScript: true,
          removeEmbeddedFiles: false,
          removeMetadata: false,
          removeLinks: false,
          removeFonts: false,
          removeXMPMetadata: false,
        },
      },
    ],
    scopeLabel: "All PDFs on this device",
    // No policy-level setting fields: tool config lives in the Workflow step;
    // output naming + retries are set in the wizard.
    fields: [],
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
