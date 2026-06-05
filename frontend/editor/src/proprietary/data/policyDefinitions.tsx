/**
 * Static definitions + mock context for Policies, mirrored from the design
 * prototype. Everything here is mock/stub data — there is no server yet.
 */

import LayersIcon from "@mui/icons-material/Layers";
import ShieldIcon from "@mui/icons-material/Shield";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import StorageIcon from "@mui/icons-material/Storage";
import DescriptionIcon from "@mui/icons-material/Description";
import ComputerIcon from "@mui/icons-material/Computer";
import PublicIcon from "@mui/icons-material/Public";
import CloudIcon from "@mui/icons-material/Cloud";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import type {
  PolicyBilling,
  PolicyCategory,
  PolicyConfigDef,
  PolicySource,
  PolicyUser,
} from "@app/types/policies";

const ICON_SX = { fontSize: "1rem" } as const;

/** The 5 policy categories, in the prototype's narrative order. */
export const POLICY_CATEGORIES: PolicyCategory[] = [
  {
    id: "ingestion",
    label: "Ingestion",
    icon: <LayersIcon sx={ICON_SX} />,
    desc: "Classify documents, extract structured data, enforce naming conventions, and normalize pages.",
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
    icon: <VerifiedUserIcon sx={ICON_SX} />,
    desc: "Enforce HIPAA, GDPR, SOC 2, or FedRAMP requirements on every document.",
  },
  {
    id: "routing",
    label: "Routing",
    icon: <CallSplitIcon sx={ICON_SX} />,
    desc: "Auto-route documents to the right team, folder, or system.",
  },
  {
    id: "retention",
    label: "Retention",
    icon: <StorageIcon sx={ICON_SX} />,
    desc: "Set how long documents are kept, when to archive, and when to delete.",
  },
];

/** Per-category narrative + editable fields (from the prototype's POLICY_CONFIG). */
export const POLICY_CONFIG: Record<string, PolicyConfigDef> = {
  ingestion: {
    summary:
      "Classifies documents, extracts structured data, enforces naming, and normalizes pages.",
    rules: ["Classify", "Extract", "Name", "Normalize"],
    scopeLabel: "All PDFs on this device",
    fields: [
      {
        label: "Auto-classify",
        key: "autoClassify",
        type: "toggle",
        value: true,
      },
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
      {
        label: "Extract tables",
        key: "extractTables",
        type: "toggle",
        value: true,
      },
      {
        label: "OCR level",
        key: "ocrLevel",
        type: "select",
        value: "High",
        options: ["Standard", "High", "Maximum"],
      },
      {
        label: "Push extracted data to",
        key: "pushTo",
        type: "select",
        value: "None",
        options: ["None", "Salesforce", "HubSpot", "Webhook", "S3"],
      },
      {
        label: "Naming pattern",
        key: "pattern",
        type: "text",
        value: "{type}_{date}_{counterparty}_{id}.pdf",
      },
      { label: "Auto-tag", key: "autoTag", type: "toggle", value: true },
      {
        label: "Auto-rotate pages",
        key: "autoRotate",
        type: "toggle",
        value: true,
      },
      {
        label: "Strip blank pages",
        key: "stripBlank",
        type: "toggle",
        value: true,
      },
      {
        label: "Normalize page size",
        key: "normalize",
        type: "select",
        value: "Keep original",
        options: ["Letter", "A4", "Keep original"],
      },
    ],
  },
  security: {
    summary:
      "Detects PII, encrypts, verifies authenticity, controls access, and certifies documents.",
    rules: ["Detect PII", "Encrypt", "Verify", "Access", "Certify"],
    scopeLabel: "All PDFs on this device",
    fields: [
      { label: "Detect PII", key: "detectPII", type: "toggle", value: true },
      {
        label: "PII classes to detect",
        key: "piiClasses",
        type: "chips",
        value: [
          "SSN",
          "Date of birth",
          "Names",
          "Addresses",
          "Account numbers",
          "Phone numbers",
        ],
        options: [
          "SSN",
          "Date of birth",
          "Names",
          "Addresses",
          "Account numbers",
          "Phone numbers",
          "Email addresses",
          "Passport numbers",
          "Driver license",
          "Credit card numbers",
          "IP addresses",
          "Medical record numbers",
        ],
      },
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
      { label: "Encrypt at rest", key: "encrypt", type: "toggle", value: true },
      {
        label: "Key handling",
        key: "keyHandling",
        type: "select",
        value: "Stirling-managed",
        options: ["Stirling-managed", "BYOK", "HYOK"],
      },
      {
        label: "Tamper detection",
        key: "tamperDetect",
        type: "toggle",
        value: true,
      },
      {
        label: "Verify signatures",
        key: "verifySig",
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
      { label: "Policy seal", key: "policySeal", type: "toggle", value: true },
      { label: "Watermark", key: "watermark", type: "toggle", value: false },
    ],
  },
  compliance: {
    summary:
      "Validates documents against regulatory frameworks before they leave the system.",
    rules: ["Framework scan", "Enforce action", "Audit trail"],
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

/** Base per-document cost; total scales with the active-policy count. */
export const PER_POLICY_DOC_COST = 0.02;

/** Mock current user/org for the permission model. */
export const MOCK_POLICY_USER: PolicyUser = {
  name: "Matt Joseph",
  email: "matt@stirlingpdf.com",
  initials: "MJ",
  role: "owner",
  hasOrg: true,
  policyPermission: true,
};

/** Mock billing context. */
export const MOCK_POLICY_BILLING: PolicyBilling = {
  used: 247,
  monthlyQuota: 500,
  tier: "free",
};

/** Whether the given user may configure (vs. read-only view) policies. */
export function canConfigurePolicies(user: PolicyUser): boolean {
  return (
    !user.hasOrg ||
    user.role === "owner" ||
    user.role === "admin" ||
    user.policyPermission === true
  );
}
