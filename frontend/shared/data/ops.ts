/**
 * The Stirling operation library.
 *
 * Three layers, ported faithfully from the prototype:
 *
 *  1. PIPELINE_OPS — the canonical pipeline-stage taxonomy. Ops are grouped
 *     by `OpKind` (ingest / validate / modify / secure / store / alert) which
 *     drives accent colours in chip rendering.
 *
 *  2. LIBRARY_OPS — the broader catalogue surfaced in the composer's
 *     Operations picker. Includes everything in PIPELINE_OPS plus the wider
 *     PDF tool set (formatting, extraction, AI-powered ops, schema-aware
 *     ops). Each library op also carries an `OpCategory` for finer-grained
 *     grouping in the picker UI.
 *
 *  3. PIPELINE_AGENTS — one-click bundles of related ops (PII Sweep, Trust &
 *     Verify, Compliance Pack, Format Prep). Selecting an agent expands its
 *     `ops` list into the chip row.
 *
 * SOURCE_OPTIONS and DESTINATION_OPTIONS sit alongside as the structural
 * rails — every pipeline has exactly one source and one destination.
 */

/** The pipeline-stage taxonomy a chip-row uses for accent colours. */
export type OpKind =
  | "ingest"
  | "validate"
  | "modify"
  | "secure"
  | "store"
  | "alert";

/** Finer-grained groupings shown in the Operations picker. */
export type OpCategory =
  | "Document Security"
  | "Validation"
  | "Classification"
  | "Document Review"
  | "Signing"
  | "Page Formatting"
  | "Extraction"
  | "Removal"
  | "Automation"
  | "Advanced Formatting"
  | "Developer Tools";

export interface PipelineOp {
  id: string;
  label: string;
  icon: string;
  desc: string;
  kind: OpKind;
  /** Ship in the default chip row when this op's stage is on. */
  defaultOn?: boolean;
  /** Only configurable in the pipeline composer (not as an ad-hoc op). */
  pipelineOnly?: boolean;
}

export interface LibraryOp extends Omit<
  PipelineOp,
  "defaultOn" | "pipelineOnly"
> {
  category: OpCategory;
  provider?: "claude" | "stirling";
}

export interface PipelineAgent {
  id: string;
  label: string;
  icon: string;
  desc: string;
  /** Op IDs from PIPELINE_OPS that this agent expands into. */
  ops: string[];
}

export interface SourceOption {
  id: "upload" | "webhook" | "s3" | "email" | "scheduled";
  label: string;
  icon: string;
  desc: string;
}

export interface DestinationOption {
  id: "vault" | "s3" | "webhook" | "pipeline" | "database" | "sftp";
  label: string;
  icon: string;
  desc: string;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  PIPELINE_OPS — canonical stages                                         */
/* ──────────────────────────────────────────────────────────────────────── */

export const PIPELINE_OPS: Record<OpKind, PipelineOp[]> = {
  ingest: [
    {
      id: "ocr",
      label: "OCR",
      icon: "eye",
      kind: "ingest",
      desc: "Text-recognize scanned or image-based pages",
    },
    {
      id: "parse",
      label: "Parse",
      icon: "layout",
      kind: "ingest",
      desc: "Reconstruct reading order and layout structure",
    },
    {
      id: "classify",
      label: "Classify",
      icon: "layers",
      kind: "ingest",
      desc: "Identify the document type and return a confidence score",
    },
    {
      id: "bundle-split",
      label: "Bundle split",
      icon: "grid",
      kind: "ingest",
      desc: "Split a multi-document upload into component documents",
    },
    {
      id: "extract",
      label: "Extract",
      icon: "sparkles",
      kind: "ingest",
      desc: "Pull structured fields from the document into a typed schema",
    },
  ],
  validate: [
    {
      id: "validate",
      label: "Schema validate",
      icon: "shield",
      kind: "validate",
      desc: "Check required fields, business rules, and coverage gaps against the typed schema",
    },
    {
      id: "authenticity",
      label: "Authenticity",
      icon: "check",
      kind: "validate",
      desc: "Verify the document is genuine (signature, issuer, watermark checks)",
    },
    {
      id: "tamper-check",
      label: "Tamper check",
      icon: "alertTriangle",
      kind: "validate",
      desc: "Detect modifications since signing or last-known-good state",
    },
    {
      id: "source-auth",
      label: "Source auth",
      icon: "lock",
      kind: "validate",
      desc: "Confirm the document came from an authenticated source",
    },
    {
      id: "counterparty-match",
      label: "Counterparty match",
      icon: "userPlus",
      kind: "validate",
      desc: "Match the document counterparty against expected identity",
    },
    {
      id: "confidence-check",
      label: "Confidence bounds",
      icon: "activity",
      kind: "validate",
      desc: "Gate downstream ops on extraction-confidence thresholds",
    },
  ],
  modify: [
    {
      id: "merge",
      label: "Merge",
      icon: "layers",
      kind: "modify",
      desc: "Combine multiple PDFs into a single document",
    },
    {
      id: "split",
      label: "Split",
      icon: "grid",
      kind: "modify",
      desc: "Split a PDF into pages, sections, or by document boundary",
    },
    {
      id: "convert",
      label: "Convert",
      icon: "fileText",
      kind: "modify",
      desc: "Convert between PDF, Word, Excel, image, HTML, Markdown",
    },
    {
      id: "compress",
      label: "Compress",
      icon: "package",
      kind: "modify",
      desc: "Reduce file size while preserving fidelity",
    },
    {
      id: "rotate",
      label: "Rotate",
      icon: "arrowRight",
      kind: "modify",
      desc: "Rotate pages or correct page orientation",
    },
    {
      id: "crop",
      label: "Crop",
      icon: "layout",
      kind: "modify",
      desc: "Crop pages to a region or trim margins",
    },
  ],
  secure: [
    {
      id: "redact",
      label: "Redact PII",
      icon: "eye",
      kind: "secure",
      defaultOn: true,
      desc: "Remove or mask PII before the document is stored or released downstream",
    },
    {
      id: "pii-enforce",
      label: "PII/PHI enforcement",
      icon: "shield",
      kind: "secure",
      desc: "Policy check that outputs do not leak protected data beyond declared scope",
    },
    {
      id: "watermark",
      label: "Confidentiality mark",
      icon: "penTool",
      kind: "secure",
      desc: "Stamp a visible confidentiality / classification watermark onto pages",
    },
    {
      id: "attribution-watermark",
      label: "Attribution watermark",
      icon: "penTool",
      kind: "secure",
      desc: "Invisible per-recipient watermarking for leak tracing",
    },
    {
      id: "flatten",
      label: "Flatten + lock",
      icon: "layout",
      kind: "secure",
      desc: "Flatten forms and annotations to harden the document against tampering",
    },
    {
      id: "sign-output",
      label: "Signed outputs",
      icon: "penTool",
      kind: "secure",
      desc: "Tamper-evident signatures covering the artifact and run metadata",
    },
    {
      id: "encrypt-rest",
      label: "Encryption at rest",
      icon: "lock",
      kind: "secure",
      defaultOn: true,
      desc: "AES-256 on stored artifacts. Stirling-managed, customer KMS, or BYOK",
    },
    {
      id: "retention",
      label: "Retention policy",
      icon: "fileText",
      kind: "secure",
      defaultOn: true,
      pipelineOnly: true,
      desc: "How long Stirling retains the artifact, run record, and audit trail",
    },
    {
      id: "residency",
      label: "Regional residency",
      icon: "globe",
      kind: "secure",
      pipelineOnly: true,
      desc: "Where the artifact is stored and processed. Region-pin or air-gap",
    },
    {
      id: "access-policy",
      label: "Access policy",
      icon: "key",
      kind: "secure",
      defaultOn: true,
      pipelineOnly: true,
      desc: "Who can fetch the sealed artifact (signed URL, IdP-gated, public)",
    },
  ],
  store: [
    {
      id: "store-primary",
      label: "Primary store",
      icon: "fileText",
      kind: "store",
      defaultOn: true,
      pipelineOnly: true,
      desc: "Write the sealed artifact and its run record into the Documents centralized view",
    },
    {
      id: "mirror-bucket",
      label: "Mirror to bucket",
      icon: "globe",
      kind: "store",
      pipelineOnly: true,
      desc: "Copy the secured artifact to the customer’s S3 / GCS / Azure Blob for compliance archival",
    },
    {
      id: "mirror-archive",
      label: "Compliance archive",
      icon: "lock",
      kind: "store",
      pipelineOnly: true,
      desc: "Mirror to SharePoint / M365 Records / WORM-locked archive for regulated retention",
    },
    {
      id: "emit-manifest",
      label: "Processing manifest",
      icon: "penTool",
      kind: "store",
      defaultOn: true,
      pipelineOnly: true,
      desc: "Emit a signed manifest describing every stage the document passed through",
    },
  ],
  alert: [
    {
      id: "review",
      label: "Human review",
      icon: "userPlus",
      kind: "alert",
      desc: "Route the document to the review queue when rules fail",
    },
    {
      id: "flag",
      label: "Flag",
      icon: "alertTriangle",
      kind: "alert",
      desc: "Raise an in-app flag on low-confidence or out-of-policy docs",
    },
    {
      id: "notify",
      label: "Notify",
      icon: "bell",
      kind: "alert",
      desc: "Fire a webhook or email when the pipeline finishes or trips a rule",
    },
  ],
};

/** Flat lookup across every stage bucket. */
export const PIPELINE_OPS_INDEX: Record<string, PipelineOp> = (() => {
  const idx: Record<string, PipelineOp> = {};
  for (const kind of Object.keys(PIPELINE_OPS) as OpKind[]) {
    for (const op of PIPELINE_OPS[kind]) idx[op.id] = op;
  }
  return idx;
})();

export const lookupOp = (id: string): PipelineOp | null =>
  PIPELINE_OPS_INDEX[id] ?? null;

/* ──────────────────────────────────────────────────────────────────────── */
/*  PIPELINE_AGENTS — one-click op bundles                                  */
/* ──────────────────────────────────────────────────────────────────────── */

export const PIPELINE_AGENTS: readonly PipelineAgent[] = [
  {
    id: "agent-pii-sweep",
    label: "PII Sweep",
    icon: "shield",
    desc: "Redact PII categories + encrypt the sealed artifact",
    ops: ["redact", "encrypt-rest"],
  },
  {
    id: "agent-trust-verify",
    label: "Trust & Verify",
    icon: "check",
    desc: "Authenticity, tamper, and confidence checks before downstream",
    ops: ["authenticity", "tamper-check", "confidence-check"],
  },
  {
    id: "agent-compliance-pack",
    label: "Compliance Pack",
    icon: "lock",
    desc: "Redact + watermark + sign + retention policy",
    ops: ["redact", "watermark", "sign-output", "retention"],
  },
  {
    id: "agent-format-prep",
    label: "Format Prep",
    icon: "package",
    desc: "Compress and flatten before downstream consumption",
    ops: ["compress", "flatten"],
  },
];

export const lookupAgent = (id: string): PipelineAgent | null =>
  PIPELINE_AGENTS.find((a) => a.id === id) ?? null;

/* ──────────────────────────────────────────────────────────────────────── */
/*  OP_CATEGORIES — picker section metadata                                 */
/* ──────────────────────────────────────────────────────────────────────── */

export interface OpCategoryMeta {
  name: OpCategory;
  color: string;
  blurb: string;
}

export const OP_CATEGORIES: readonly OpCategoryMeta[] = [
  {
    name: "Document Security",
    color: "var(--color-red)",
    blurb: "PII, encryption, watermarks, policy seal",
  },
  {
    name: "Validation",
    color: "var(--color-blue)",
    blurb: "Schema checks, trust gates, filters",
  },
  {
    name: "Classification",
    color: "var(--color-purple)",
    blurb: "Type inference, routing, boundary detection",
  },
  {
    name: "Document Review",
    color: "var(--color-cat-compliance)",
    blurb: "Inspection, AI review, certification",
  },
  {
    name: "Signing",
    color: "var(--color-green)",
    blurb: "Digital signatures, cert sign / remove",
  },
  {
    name: "Page Formatting",
    color: "var(--color-cat-energy)",
    blurb: "Rotate, crop, layout, page-level edits",
  },
  {
    name: "Extraction",
    color: "var(--color-cat-extraction)",
    blurb: "OCR, format conversion, content pull",
  },
  {
    name: "Removal",
    color: "var(--color-amber)",
    blurb: "Drop pages, blanks, images, partition splits",
  },
  {
    name: "Automation",
    color: "var(--color-cat-operations)",
    blurb: "AI-driven generation, translation, forms",
  },
  {
    name: "Advanced Formatting",
    color: "var(--color-cat-healthcare)",
    blurb: "TOC, overlays, format-to-PDF, PDF/A",
  },
  {
    name: "Developer Tools",
    color: "var(--color-text-5)",
    blurb: "Repair, compress, metadata",
  },
];

/* ──────────────────────────────────────────────────────────────────────── */
/*  LIBRARY_OPS — full atomic operation catalogue                           */
/* ──────────────────────────────────────────────────────────────────────── */

export const LIBRARY_OPS: readonly LibraryOp[] = [
  // Validation / Document Review
  {
    id: "validate",
    label: "Schema validate",
    icon: "shield",
    kind: "validate",
    category: "Validation",
    desc: "Check required fields, business rules, and coverage gaps against the typed schema",
  },
  {
    id: "authenticity",
    label: "Authenticity",
    icon: "check",
    kind: "validate",
    category: "Validation",
    desc: "Verify the document is genuine (signature, issuer, watermark checks)",
  },
  {
    id: "tamper-check",
    label: "Tamper check",
    icon: "alertTriangle",
    kind: "validate",
    category: "Validation",
    desc: "Detect modifications since signing or last-known-good state",
  },
  {
    id: "source-auth",
    label: "Source auth",
    icon: "lock",
    kind: "validate",
    category: "Validation",
    desc: "Confirm the document came from an authenticated source",
  },
  {
    id: "counterparty-match",
    label: "Counterparty match",
    icon: "userPlus",
    kind: "validate",
    category: "Validation",
    desc: "Match the document counterparty against expected identity",
  },
  {
    id: "confidence-check",
    label: "Confidence bounds",
    icon: "activity",
    kind: "validate",
    category: "Validation",
    desc: "Gate downstream ops on extraction-confidence thresholds",
  },
  {
    id: "inspect-basic",
    label: "Basic info",
    icon: "fileText",
    kind: "validate",
    category: "Document Review",
    desc: "Get document metadata (title, author, page count, dates)",
  },
  {
    id: "inspect-pages",
    label: "Page count",
    icon: "fileText",
    kind: "validate",
    category: "Document Review",
    desc: "Return the page count of the document",
  },
  {
    id: "inspect-fonts",
    label: "Font info",
    icon: "fileText",
    kind: "validate",
    category: "Document Review",
    desc: "List fonts embedded in the document",
  },
  {
    id: "inspect-security",
    label: "Security info",
    icon: "lock",
    kind: "validate",
    category: "Document Review",
    desc: "Read security configuration (encryption, signatures, permissions)",
  },
  {
    id: "inspect-form",
    label: "Form fields",
    icon: "fileText",
    kind: "validate",
    category: "Document Review",
    desc: "Enumerate form fields and their values",
  },
  {
    id: "filter-text",
    label: "Filter by text",
    icon: "shield",
    kind: "validate",
    category: "Validation",
    desc: "Pass only docs containing specific text",
  },
  {
    id: "filter-image",
    label: "Filter by image",
    icon: "shield",
    kind: "validate",
    category: "Validation",
    desc: "Pass only docs containing images",
  },
  {
    id: "filter-page-count",
    label: "Filter by page count",
    icon: "shield",
    kind: "validate",
    category: "Validation",
    desc: "Pass only docs within a page-count range",
  },
  {
    id: "filter-page-size",
    label: "Filter by page size",
    icon: "shield",
    kind: "validate",
    category: "Validation",
    desc: "Pass only docs matching a page-dimension constraint",
  },
  {
    id: "filter-file-size",
    label: "Filter by file size",
    icon: "shield",
    kind: "validate",
    category: "Validation",
    desc: "Pass only docs within a file-size range",
  },

  // Modify / Page Formatting / Removal / Extraction / Advanced Formatting / Developer Tools
  {
    id: "merge",
    label: "Merge",
    icon: "layers",
    kind: "modify",
    category: "Page Formatting",
    desc: "Combine multiple PDFs into a single document",
  },
  {
    id: "split",
    label: "Split",
    icon: "grid",
    kind: "modify",
    category: "Removal",
    desc: "Split a PDF into pages, sections, or by document boundary",
  },
  {
    id: "split-chapters",
    label: "Split by chapters",
    icon: "grid",
    kind: "modify",
    category: "Removal",
    desc: "Split a PDF along bookmark or chapter boundaries",
  },
  {
    id: "split-size",
    label: "Split by size",
    icon: "grid",
    kind: "modify",
    category: "Removal",
    desc: "Split a PDF when it exceeds a size or page-count threshold",
  },
  {
    id: "auto-split",
    label: "Auto split",
    icon: "grid",
    kind: "modify",
    category: "Classification",
    desc: "Detect document boundaries and split automatically",
  },
  {
    id: "remove-pages",
    label: "Remove pages",
    icon: "grid",
    kind: "modify",
    category: "Removal",
    desc: "Drop specified pages from the document",
  },
  {
    id: "remove-blanks",
    label: "Remove blank pages",
    icon: "grid",
    kind: "modify",
    category: "Removal",
    desc: "Detect and drop blank pages",
  },
  {
    id: "rearrange-pages",
    label: "Rearrange pages",
    icon: "grid",
    kind: "modify",
    category: "Page Formatting",
    desc: "Reorder pages by a specified sequence",
  },
  {
    id: "rotate",
    label: "Rotate",
    icon: "arrowRight",
    kind: "modify",
    category: "Page Formatting",
    desc: "Rotate pages or correct page orientation",
  },
  {
    id: "crop",
    label: "Crop",
    icon: "layout",
    kind: "modify",
    category: "Page Formatting",
    desc: "Crop pages to a region or trim margins",
  },
  {
    id: "compress",
    label: "Compress",
    icon: "package",
    kind: "modify",
    category: "Developer Tools",
    desc: "Reduce file size while preserving fidelity",
  },
  {
    id: "flatten",
    label: "Flatten",
    icon: "layout",
    kind: "modify",
    category: "Page Formatting",
    desc: "Flatten forms and annotations into the page content",
  },
  {
    id: "repair",
    label: "Repair",
    icon: "package",
    kind: "modify",
    category: "Developer Tools",
    desc: "Repair a corrupted or malformed PDF",
  },
  {
    id: "remove-images",
    label: "Remove images",
    icon: "eye",
    kind: "modify",
    category: "Removal",
    desc: "Strip images to reduce file size",
  },
  {
    id: "update-metadata",
    label: "Update metadata",
    icon: "fileText",
    kind: "modify",
    category: "Developer Tools",
    desc: "Edit PDF metadata fields (title, author, keywords)",
  },
  {
    id: "auto-rename",
    label: "Auto rename",
    icon: "fileText",
    kind: "modify",
    category: "Classification",
    desc: "Rename based on extracted document content",
  },
  {
    id: "add-image",
    label: "Add image",
    icon: "penTool",
    kind: "modify",
    category: "Page Formatting",
    desc: "Insert an image onto pages",
  },
  {
    id: "add-stamp",
    label: "Add stamp",
    icon: "penTool",
    kind: "modify",
    category: "Page Formatting",
    desc: "Apply a stamp to pages",
  },
  {
    id: "add-page-numbers",
    label: "Page numbers",
    icon: "penTool",
    kind: "modify",
    category: "Page Formatting",
    desc: "Add page numbers to the document",
  },
  {
    id: "add-attachments",
    label: "Add attachments",
    icon: "penTool",
    kind: "modify",
    category: "Advanced Formatting",
    desc: "Embed file attachments in the PDF",
  },
  {
    id: "overlay",
    label: "Overlay PDFs",
    icon: "layers",
    kind: "modify",
    category: "Advanced Formatting",
    desc: "Overlay one PDF on top of another",
  },
  {
    id: "multi-page-layout",
    label: "Multi-page layout",
    icon: "grid",
    kind: "modify",
    category: "Advanced Formatting",
    desc: "Combine multiple pages into a single page (n-up)",
  },
  {
    id: "scale-pages",
    label: "Scale pages",
    icon: "layout",
    kind: "modify",
    category: "Page Formatting",
    desc: "Resize pages to a target dimension",
  },
  {
    id: "edit-toc",
    label: "Edit TOC",
    icon: "fileText",
    kind: "modify",
    category: "Advanced Formatting",
    desc: "Edit the table of contents / bookmarks",
  },
  {
    id: "scanner-effect",
    label: "Scanner effect",
    icon: "penTool",
    kind: "modify",
    category: "Page Formatting",
    desc: "Apply a scanned-document visual effect",
  },
  {
    id: "invert-colors",
    label: "Invert colors",
    icon: "penTool",
    kind: "modify",
    category: "Page Formatting",
    desc: "Invert page colors or replace specific colors",
  },
  {
    id: "convert-image",
    label: "PDF → image",
    icon: "fileText",
    kind: "modify",
    category: "Extraction",
    desc: "Convert PDF pages to image files",
  },
  {
    id: "image-to-pdf",
    label: "Image → PDF",
    icon: "fileText",
    kind: "modify",
    category: "Advanced Formatting",
    desc: "Convert images into a PDF",
  },
  {
    id: "convert-word",
    label: "PDF → Word",
    icon: "fileText",
    kind: "modify",
    category: "Extraction",
    desc: "Convert PDF to a DOCX document",
  },
  {
    id: "convert-pptx",
    label: "PDF → presentation",
    icon: "fileText",
    kind: "modify",
    category: "Extraction",
    desc: "Convert PDF to a PPTX deck",
  },
  {
    id: "convert-text",
    label: "PDF → text",
    icon: "fileText",
    kind: "modify",
    category: "Extraction",
    desc: "Extract plain text from the PDF",
  },
  {
    id: "convert-html",
    label: "PDF → HTML",
    icon: "fileText",
    kind: "modify",
    category: "Extraction",
    desc: "Convert PDF to HTML",
  },
  {
    id: "convert-xml",
    label: "PDF → XML",
    icon: "fileText",
    kind: "modify",
    category: "Extraction",
    desc: "Convert PDF to structured XML",
  },
  {
    id: "convert-csv",
    label: "PDF → CSV",
    icon: "fileText",
    kind: "modify",
    category: "Extraction",
    desc: "Extract tables from the PDF as CSV",
  },
  {
    id: "convert-markdown",
    label: "PDF → Markdown",
    icon: "fileText",
    kind: "modify",
    category: "Extraction",
    desc: "Convert PDF to Markdown",
  },
  {
    id: "convert-pdfa",
    label: "PDF → PDF/A",
    icon: "fileText",
    kind: "modify",
    category: "Advanced Formatting",
    desc: "Convert to the PDF/A archival format",
  },
  {
    id: "html-to-pdf",
    label: "HTML → PDF",
    icon: "fileText",
    kind: "modify",
    category: "Advanced Formatting",
    desc: "Render HTML as a PDF",
  },
  {
    id: "markdown-to-pdf",
    label: "Markdown → PDF",
    icon: "fileText",
    kind: "modify",
    category: "Advanced Formatting",
    desc: "Render Markdown as a PDF",
  },
  {
    id: "url-to-pdf",
    label: "URL → PDF",
    icon: "fileText",
    kind: "modify",
    category: "Advanced Formatting",
    desc: "Render a web page as a PDF",
  },
  {
    id: "eml-to-pdf",
    label: "Email → PDF",
    icon: "fileText",
    kind: "modify",
    category: "Advanced Formatting",
    desc: "Convert an email file (.eml) to a PDF",
  },
  {
    id: "ocr",
    label: "OCR",
    icon: "eye",
    kind: "modify",
    category: "Extraction",
    desc: "Optical character recognition on scanned pages",
  },
  {
    id: "extract-images",
    label: "Extract images",
    icon: "sparkles",
    kind: "modify",
    category: "Extraction",
    desc: "Extract embedded images from the PDF",
  },
  {
    id: "extract-bookmarks",
    label: "Extract bookmarks",
    icon: "sparkles",
    kind: "modify",
    category: "Extraction",
    desc: "Extract the bookmark / outline tree",
  },
  {
    id: "extract-scans",
    label: "Extract scans",
    icon: "sparkles",
    kind: "modify",
    category: "Extraction",
    desc: "Detect and extract scanned image regions",
  },

  // Secure
  {
    id: "redact",
    label: "Redact PII",
    icon: "eye",
    kind: "secure",
    category: "Document Security",
    desc: "Remove or mask PII before the document is stored or released",
  },
  {
    id: "pii-enforce",
    label: "PII / PHI enforcement",
    icon: "shield",
    kind: "secure",
    category: "Document Security",
    desc: "Policy check that outputs do not leak protected data beyond declared scope",
  },
  {
    id: "auto-redact",
    label: "Auto-redact",
    icon: "eye",
    kind: "secure",
    category: "Document Security",
    desc: "Automatically redact sensitive content based on policy",
  },
  {
    id: "watermark",
    label: "Confidentiality mark",
    icon: "penTool",
    kind: "secure",
    category: "Document Security",
    desc: "Apply a visible confidentiality watermark to pages",
  },
  {
    id: "attribution-watermark",
    label: "Attribution watermark",
    icon: "penTool",
    kind: "secure",
    category: "Document Security",
    desc: "Embed a per-recipient invisible watermark for leak tracing",
  },
  {
    id: "sanitize",
    label: "Sanitize",
    icon: "shield",
    kind: "secure",
    category: "Document Security",
    desc: "Strip hidden data, JavaScript, and metadata from the PDF",
  },
  {
    id: "sign-output",
    label: "Sign outputs",
    icon: "penTool",
    kind: "secure",
    category: "Signing",
    desc: "Apply a tamper-evident signature covering the artifact and run metadata",
  },
  {
    id: "cert-sign",
    label: "Certificate sign",
    icon: "penTool",
    kind: "secure",
    category: "Signing",
    desc: "Sign with a digital certificate",
  },
  {
    id: "add-password",
    label: "Add password",
    icon: "lock",
    kind: "secure",
    category: "Document Security",
    desc: "Password-protect the output PDF",
  },
  {
    id: "encrypt-rest",
    label: "Encryption at rest",
    icon: "lock",
    kind: "secure",
    category: "Document Security",
    desc: "AES-256 encryption on stored artifacts (Stirling-managed, BYOK, or HYOK)",
  },
  {
    id: "flatten-secure",
    label: "Flatten + lock",
    icon: "layout",
    kind: "secure",
    category: "Document Security",
    desc: "Flatten forms and lock the document against tampering",
  },
  {
    id: "retention",
    label: "Retention policy",
    icon: "fileText",
    kind: "secure",
    category: "Document Security",
    desc: "How long Stirling retains the artifact, run record, and audit trail",
  },
  {
    id: "residency",
    label: "Regional residency",
    icon: "globe",
    kind: "secure",
    category: "Document Security",
    desc: "Where the artifact is stored and processed (region-pin or air-gap)",
  },
  {
    id: "access-policy",
    label: "Access policy",
    icon: "key",
    kind: "secure",
    category: "Document Security",
    desc: "Who can fetch the sealed artifact (signed URL, IdP-gated, public)",
  },
  {
    id: "remove-cert-sign",
    label: "Remove signature",
    icon: "penTool",
    kind: "secure",
    category: "Signing",
    desc: "Strip a digital signature from the document",
  },

  // AI-powered ops
  {
    id: "summarize",
    label: "Document summarizer",
    icon: "fileText",
    kind: "modify",
    category: "Document Review",
    provider: "claude",
    desc: "Generate executive summaries and key insights",
  },
  {
    id: "translate",
    label: "Document translator",
    icon: "globe",
    kind: "modify",
    category: "Automation",
    provider: "claude",
    desc: "Translate documents while preserving formatting",
  },
  {
    id: "contract-analyze",
    label: "Contract analyzer",
    icon: "shield",
    kind: "validate",
    category: "Document Review",
    provider: "claude",
    desc: "Review contracts for risks, obligations, and key terms",
  },
  {
    id: "compliance-audit",
    label: "Compliance auditor",
    icon: "check",
    kind: "validate",
    category: "Document Review",
    provider: "stirling",
    desc: "Check documents against regulatory requirements",
  },
  {
    id: "generate",
    label: "Document generation",
    icon: "penTool",
    kind: "modify",
    category: "Automation",
    provider: "claude",
    desc: "Create contracts, reports, and business documents from prompts",
  },
  {
    id: "certify",
    label: "Document certification",
    icon: "check",
    kind: "validate",
    category: "Document Review",
    provider: "claude",
    desc: "Review documents against criteria and certify approval",
  },
  {
    id: "intelligent-forms",
    label: "Intelligent forms",
    icon: "fileText",
    kind: "modify",
    category: "Automation",
    provider: "stirling",
    desc: "Auto-fill forms and extract submissions",
  },

  // Schema-aware ops (D35)
  {
    id: "schema-extract",
    label: "Schema-aware extract",
    icon: "sparkles",
    kind: "modify",
    category: "Classification",
    desc: "Extract the typed fields the inferred schema declares — not heuristic regexes. Confidence scored per field",
  },
  {
    id: "schema-validate",
    label: "Schema validate",
    icon: "shield",
    kind: "validate",
    category: "Validation",
    desc: "Validate the document against its inferred schema. Required-field coverage, type-correctness, business rules",
  },
  {
    id: "schema-route",
    label: "Conditional routing",
    icon: "arrowRight",
    kind: "validate",
    category: "Classification",
    desc: "Fork to a downstream pipeline based on the inferred schema (Invoice → AP, Loan Closing → Compliance, etc.)",
  },
  {
    id: "drift-check",
    label: "Schema drift check",
    icon: "alertTriangle",
    kind: "validate",
    category: "Validation",
    desc: "Flag when a doc claims to be a known type but its field shape diverges from prior examples",
  },
  {
    id: "smart-redact",
    label: "Field-aware redact",
    icon: "eye",
    kind: "secure",
    category: "Document Security",
    desc: "Schema-aware PII redaction — targets fields the schema declares as PII, not regex fishing",
  },
  {
    id: "field-confidence",
    label: "Field confidence",
    icon: "activity",
    kind: "validate",
    category: "Validation",
    desc: "Per-field confidence scoring backed by the typed schema",
  },
  {
    id: "schema-split",
    label: "Schema-aware split",
    icon: "grid",
    kind: "modify",
    category: "Classification",
    desc: "Split a multi-doc bundle along schema boundaries",
  },
  {
    id: "smart-watermark",
    label: "Smart watermark",
    icon: "penTool",
    kind: "secure",
    category: "Document Security",
    desc: "Watermark text incorporates extracted schema fields",
  },
];

export const LIBRARY_OPS_INDEX: Record<string, LibraryOp> = Object.fromEntries(
  LIBRARY_OPS.map((op) => [op.id, op]),
);

export function lookupLibraryOp(id: string): LibraryOp | PipelineOp | null {
  return LIBRARY_OPS_INDEX[id] ?? lookupOp(id);
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  SOURCES + DESTINATIONS — the rails                                      */
/* ──────────────────────────────────────────────────────────────────────── */

export const SOURCE_OPTIONS: readonly SourceOption[] = [
  {
    id: "upload",
    label: "Upload API",
    icon: "upload",
    desc: "POST documents to a Stirling endpoint",
  },
  {
    id: "webhook",
    label: "Inbound webhook",
    icon: "plug",
    desc: "Receive documents from another system via webhook",
  },
  {
    id: "s3",
    label: "S3 bucket watch",
    icon: "server",
    desc: "Poll an S3 bucket for new files",
  },
  {
    id: "email",
    label: "Email intake",
    icon: "fileText",
    desc: "Route an inbox to this pipeline",
  },
  {
    id: "scheduled",
    label: "Scheduled import",
    icon: "activity",
    desc: "Fetch from SFTP/URL on a schedule",
  },
];

export const DESTINATION_OPTIONS: readonly DestinationOption[] = [
  {
    id: "vault",
    label: "Stirling vault",
    icon: "shield",
    desc: "Store the processed document and extracted data in Stirling",
  },
  {
    id: "s3",
    label: "S3 bucket",
    icon: "server",
    desc: "Write results to an S3 bucket",
  },
  {
    id: "webhook",
    label: "Outbound webhook",
    icon: "externalLink",
    desc: "POST results to a URL you control",
  },
  {
    id: "pipeline",
    label: "Another pipeline",
    icon: "arrowRight",
    desc: "Chain to a second pipeline",
  },
  {
    id: "database",
    label: "Database",
    icon: "database",
    desc: "Insert extracted fields into Postgres/Snowflake/BigQuery",
  },
  {
    id: "sftp",
    label: "SFTP",
    icon: "fileText",
    desc: "Drop output files on an SFTP server",
  },
];

export const lookupSource = (id: string) =>
  SOURCE_OPTIONS.find((s) => s.id === id) ?? null;
export const lookupDestination = (id: string) =>
  DESTINATION_OPTIONS.find((d) => d.id === id) ?? null;
