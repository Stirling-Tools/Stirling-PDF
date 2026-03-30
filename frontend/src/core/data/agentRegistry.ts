/**
 * Agent Registry — the single source of truth for all Stirling PDF agents.
 *
 * Each agent definition is static data (id, name, category, quickActions, etc.).
 * Runtime state (status, chat history) lives in AgentContext, not here.
 *
 * To add a new agent:
 *   1. Add its AgentId to the union type
 *   2. Add its AgentDefinition to AGENT_DEFINITIONS
 *   3. It will automatically appear in the right panel under its category
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Every agent has a unique string id. Add new ones here. */
export type AgentId =
  // General
  | 'stirling-general'
  // Core document intelligence
  | 'data-extract'
  | 'document-summary'
  | 'data-analysis'
  | 'document-labelling'
  | 'schema-validation'
  | 'number-validation'
  | 'contradiction-detection'
  // Editing & transformation
  | 'advanced-redaction'
  | 'edit-text'
  | 'form-fill'
  | 'form-creation'
  | 'smart-split'
  | 'doc-creation'
  | 'rebrander'
  // Workflow & validation
  | 'requirement-trees'
  | 'scan-smart'
  | 'completion-validation'
  // Comparison & understanding
  | 'semantic-diff'
  // Automation & AI
  | 'pdf-comments-chatbot'
  | 'knowledge-generator'
  | 'smart-routing'
  | 'smart-annotation'
  // File management
  | 'auto-rename'
  | 'internal-doc-prep'
  | 'external-doc-prep'
  // Security
  | 'secure-pdf';

export type AgentCategory =
  | 'general'
  | 'intelligence'
  | 'editing'
  | 'workflow'
  | 'comparison'
  | 'automation'
  | 'file-management'
  | 'security';

export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  /** MUI icon name hint — the component maps this to an actual icon */
  iconHint?: string;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  shortDescription: string;
  fullDescription: string;
  category: AgentCategory;
  /** MUI icon name hint for the agent list */
  iconHint: string;
  /** Color token for the icon background  (CSS variable) */
  color: string;
  /** Quick-action chips shown when opening the agent chat */
  quickActions: QuickAction[];
  /** If true, this agent can delegate to any other agent */
  isGeneralAgent?: boolean;
  /** If true, this agent requires files to be loaded in the workbench */
  requiresFiles?: boolean;
}

export interface AgentCategoryMeta {
  id: AgentCategory;
  label: string;
  order: number;
}

// ---------------------------------------------------------------------------
// Category metadata (controls display order & labels)
// ---------------------------------------------------------------------------

export const AGENT_CATEGORIES: AgentCategoryMeta[] = [
  { id: 'general', label: 'General', order: 0 },
  { id: 'intelligence', label: 'Document Intelligence', order: 1 },
  { id: 'editing', label: 'Editing & Transformation', order: 2 },
  { id: 'workflow', label: 'Workflow & Validation', order: 3 },
  { id: 'comparison', label: 'Comparison', order: 4 },
  { id: 'automation', label: 'Automation & AI', order: 5 },
  { id: 'file-management', label: 'File Management', order: 6 },
  { id: 'security', label: 'Security', order: 7 },
];

// ---------------------------------------------------------------------------
// Agent definitions
// ---------------------------------------------------------------------------

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  // ── General ──────────────────────────────────────────────────────────
  {
    id: 'stirling-general',
    name: 'Stirling',
    shortDescription: 'Your general-purpose PDF assistant',
    fullDescription:
      'Ask Stirling anything about your documents. It can delegate to any specialised agent automatically — summarise, extract data, redact, compare, and more.',
    category: 'general',
    iconHint: 'SmartToyRounded',
    color: 'var(--mantine-color-blue-6)',
    isGeneralAgent: true,
    quickActions: [
      { id: 'summarise', label: 'Summarise this document', prompt: 'Summarise the key points of this PDF.', iconHint: 'Summarize' },
      { id: 'extract-all', label: 'Extract all data', prompt: 'Extract all structured data (tables, forms, key-value pairs) from this document.', iconHint: 'TableChart' },
      { id: 'what-can', label: 'What can you do?', prompt: 'List all the things you can help me with for this document.', iconHint: 'Help' },
      { id: 'redact-sensitive', label: 'Redact sensitive info', prompt: 'Find and redact all sensitive/PII information in this document.', iconHint: 'Security' },
    ],
  },

  // ── Core Document Intelligence ───────────────────────────────────────
  {
    id: 'data-extract',
    name: 'Data Extraction',
    shortDescription: 'Extract tables, forms & structured data',
    fullDescription:
      'Pulls structured data from your PDFs — tables, key-value pairs, form fields — and outputs it as clean JSON or CSV.',
    category: 'intelligence',
    iconHint: 'DataObjectRounded',
    color: 'var(--mantine-color-violet-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'extract-tables', label: 'Extract tables', prompt: 'Extract all tables from this document into structured data.' },
      { id: 'extract-kv', label: 'Extract key-value pairs', prompt: 'Extract all key-value pairs from this document.' },
      { id: 'to-csv', label: 'Export to CSV', prompt: 'Extract data and export it as a CSV file.' },
    ],
  },
  {
    id: 'document-summary',
    name: 'Document Summary',
    shortDescription: 'Summarise documents intelligently',
    fullDescription:
      'Generates concise, structured summaries of your PDFs — from executive briefs to detailed section-by-section breakdowns.',
    category: 'intelligence',
    iconHint: 'SummarizeRounded',
    color: 'var(--mantine-color-blue-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'exec-summary', label: 'Executive summary', prompt: 'Create a short executive summary of this document.' },
      { id: 'detailed-summary', label: 'Detailed breakdown', prompt: 'Provide a detailed section-by-section summary.' },
      { id: 'key-points', label: 'Key points only', prompt: 'List only the key points and takeaways.' },
    ],
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    shortDescription: 'Analyse document data & trends',
    fullDescription:
      'Analyses numerical data, charts, and trends within your documents to provide insights and observations.',
    category: 'intelligence',
    iconHint: 'AnalyticsRounded',
    color: 'var(--mantine-color-cyan-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'find-trends', label: 'Find trends', prompt: 'Analyse the data in this document and identify any trends.' },
      { id: 'highlight-anomalies', label: 'Highlight anomalies', prompt: 'Find any data anomalies or outliers in this document.' },
    ],
  },
  {
    id: 'document-labelling',
    name: 'Document Labelling',
    shortDescription: 'Classify & tag documents automatically',
    fullDescription:
      'Automatically classifies your document by type, department, topic, and sensitivity level.',
    category: 'intelligence',
    iconHint: 'LabelRounded',
    color: 'var(--mantine-color-teal-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'classify', label: 'Classify this document', prompt: 'Classify this document by type and topic.' },
      { id: 'suggest-tags', label: 'Suggest tags', prompt: 'Suggest relevant tags and labels for this document.' },
    ],
  },
  {
    id: 'schema-validation',
    name: 'Schema Validation',
    shortDescription: 'Validate documents against a schema',
    fullDescription:
      'Checks whether a document conforms to a predefined schema, template, or set of structural requirements.',
    category: 'intelligence',
    iconHint: 'FactCheckRounded',
    color: 'var(--mantine-color-indigo-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'validate-schema', label: 'Validate against schema', prompt: 'Check if this document conforms to the expected structure.' },
      { id: 'list-violations', label: 'List violations', prompt: 'List all structural violations or missing fields.' },
    ],
  },
  {
    id: 'number-validation',
    name: 'Number Validation',
    shortDescription: 'Verify calculations & numeric data',
    fullDescription:
      'Cross-checks numbers, totals, calculations, and financial figures within your documents.',
    category: 'intelligence',
    iconHint: 'CalculateRounded',
    color: 'var(--mantine-color-orange-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'verify-totals', label: 'Verify totals', prompt: 'Check all totals and calculations in this document for accuracy.' },
      { id: 'find-discrepancies', label: 'Find discrepancies', prompt: 'Find any numerical discrepancies or calculation errors.' },
    ],
  },
  {
    id: 'contradiction-detection',
    name: 'Contradiction Detection',
    shortDescription: 'Find conflicting statements',
    fullDescription:
      'Scans your document for internal contradictions, inconsistent claims, or conflicting data points.',
    category: 'intelligence',
    iconHint: 'ReportProblemRounded',
    color: 'var(--mantine-color-red-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'find-contradictions', label: 'Find contradictions', prompt: 'Scan for any contradictory or inconsistent statements.' },
      { id: 'consistency-report', label: 'Consistency report', prompt: 'Generate a full consistency report for this document.' },
    ],
  },

  // ── Editing & Transformation ─────────────────────────────────────────
  {
    id: 'advanced-redaction',
    name: 'Advanced Redaction',
    shortDescription: 'Auto-detect & redact sensitive information',
    fullDescription:
      'Uses AI to detect PII, financial data, and other sensitive information, then redacts it automatically.',
    category: 'editing',
    iconHint: 'AutoFixHighRounded',
    color: 'var(--mantine-color-red-5)',
    requiresFiles: true,
    quickActions: [
      { id: 'redact-pii', label: 'Redact all PII', prompt: 'Find and redact all personally identifiable information.' },
      { id: 'redact-financial', label: 'Redact financial data', prompt: 'Redact all financial figures and account numbers.' },
      { id: 'preview-redactions', label: 'Preview before redacting', prompt: 'Show me what would be redacted without applying changes.' },
    ],
  },
  {
    id: 'edit-text',
    name: 'Edit Text',
    shortDescription: 'AI-assisted text editing',
    fullDescription:
      'Edit, rewrite, or correct text within your PDF using natural language instructions.',
    category: 'editing',
    iconHint: 'EditNoteRounded',
    color: 'var(--mantine-color-blue-5)',
    requiresFiles: true,
    quickActions: [
      { id: 'fix-grammar', label: 'Fix grammar', prompt: 'Fix all grammatical errors in this document.' },
      { id: 'rewrite-formal', label: 'Make more formal', prompt: 'Rewrite the text in a more formal professional tone.' },
      { id: 'simplify', label: 'Simplify language', prompt: 'Simplify the language to make it more accessible.' },
    ],
  },
  {
    id: 'form-fill',
    name: 'Form Fill',
    shortDescription: 'Intelligently fill PDF forms',
    fullDescription:
      'Analyses form fields and fills them based on provided data, context, or previous submissions.',
    category: 'editing',
    iconHint: 'AssignmentRounded',
    color: 'var(--mantine-color-green-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'detect-fields', label: 'Detect form fields', prompt: 'Identify all fillable form fields in this document.' },
      { id: 'fill-from-data', label: 'Fill from data', prompt: 'Fill the form fields using the data I provide.' },
    ],
  },
  {
    id: 'form-creation',
    name: 'Form Creation',
    shortDescription: 'Create PDF forms from scratch',
    fullDescription:
      'Generates fillable PDF forms based on your specifications — from simple contact forms to complex multi-page applications.',
    category: 'editing',
    iconHint: 'PostAddRounded',
    color: 'var(--mantine-color-green-5)',
    quickActions: [
      { id: 'create-form', label: 'Create a form', prompt: 'Create a new PDF form based on my requirements.' },
      { id: 'form-template', label: 'Use a template', prompt: 'Show me available form templates to start from.' },
    ],
  },
  {
    id: 'smart-split',
    name: 'Smart Split',
    shortDescription: 'Context-aware document splitting',
    fullDescription:
      'Splits documents intelligently based on content — by chapter, section, topic, or logical boundaries.',
    category: 'editing',
    iconHint: 'ContentCutRounded',
    color: 'var(--mantine-color-yellow-7)',
    requiresFiles: true,
    quickActions: [
      { id: 'split-chapters', label: 'Split by chapter', prompt: 'Split this document by chapter or major section.' },
      { id: 'split-topic', label: 'Split by topic', prompt: 'Split this document into separate files by topic.' },
    ],
  },
  {
    id: 'doc-creation',
    name: 'Document Creation',
    shortDescription: 'Generate new documents from prompts',
    fullDescription:
      'Creates new PDF documents based on your instructions — reports, letters, proposals, and more.',
    category: 'editing',
    iconHint: 'NoteAddRounded',
    color: 'var(--mantine-color-blue-5)',
    quickActions: [
      { id: 'create-report', label: 'Create a report', prompt: 'Create a new report document based on my requirements.' },
      { id: 'create-letter', label: 'Create a letter', prompt: 'Create a formal letter based on my instructions.' },
    ],
  },
  {
    id: 'rebrander',
    name: 'Rebrander',
    shortDescription: 'White-label & rebrand documents',
    fullDescription:
      'Replaces branding elements — logos, colors, company names — across your documents for white-labelling.',
    category: 'editing',
    iconHint: 'BrushRounded',
    color: 'var(--mantine-color-pink-5)',
    requiresFiles: true,
    quickActions: [
      { id: 'replace-logo', label: 'Replace logo', prompt: 'Replace all instances of the current logo with a new one.' },
      { id: 'rebrand-text', label: 'Rebrand text', prompt: 'Replace all brand name references with a new brand name.' },
    ],
  },

  // ── Workflow & Validation ────────────────────────────────────────────
  {
    id: 'requirement-trees',
    name: 'Requirement Trees',
    shortDescription: 'Validate requirement hierarchies',
    fullDescription:
      'Maps and validates requirement trees, ensuring all requirements are met and properly linked.',
    category: 'workflow',
    iconHint: 'AccountTreeRounded',
    color: 'var(--mantine-color-grape-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'map-requirements', label: 'Map requirements', prompt: 'Extract and map all requirements from this document.' },
      { id: 'check-completeness', label: 'Check completeness', prompt: 'Verify all requirements are addressed.' },
    ],
  },
  {
    id: 'scan-smart',
    name: 'Scan Smart',
    shortDescription: 'Intelligent document scanning & ingestion',
    fullDescription:
      'Intelligently processes scanned documents — OCR, orientation correction, quality enhancement, and metadata extraction.',
    category: 'workflow',
    iconHint: 'DocumentScannerRounded',
    color: 'var(--mantine-color-teal-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'scan-enhance', label: 'Scan & enhance', prompt: 'Process this scanned document with OCR and quality enhancement.' },
      { id: 'batch-scan', label: 'Batch process', prompt: 'Process all scanned documents in the workbench.' },
    ],
  },
  {
    id: 'completion-validation',
    name: 'Completion Check',
    shortDescription: 'Is this document finished?',
    fullDescription:
      'Analyses a document to determine if it is complete — checks for missing sections, signatures, dates, and required fields.',
    category: 'workflow',
    iconHint: 'TaskAltRounded',
    color: 'var(--mantine-color-green-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'check-complete', label: 'Is this complete?', prompt: 'Check if this document is complete and ready for submission.' },
      { id: 'missing-fields', label: 'Find missing fields', prompt: 'Identify any missing or empty required fields.' },
    ],
  },

  // ── Comparison & Understanding ───────────────────────────────────────
  {
    id: 'semantic-diff',
    name: 'Semantic Diff',
    shortDescription: 'Compare documents by meaning',
    fullDescription:
      'Goes beyond text-level diff to compare the semantic meaning of two document versions, highlighting meaningful changes.',
    category: 'comparison',
    iconHint: 'CompareRounded',
    color: 'var(--mantine-color-indigo-5)',
    requiresFiles: true,
    quickActions: [
      { id: 'compare-versions', label: 'Compare two versions', prompt: 'Compare these two documents and show meaningful differences.' },
      { id: 'changelog', label: 'Generate changelog', prompt: 'Generate a changelog of meaningful differences between versions.' },
    ],
  },

  // ── Automation & AI ──────────────────────────────────────────────────
  {
    id: 'pdf-comments-chatbot',
    name: 'Comments Chatbot',
    shortDescription: 'Chat with PDF comments & annotations',
    fullDescription:
      'Reads all comments and annotations in your PDF, lets you ask questions about them, and can take actions based on the discussion.',
    category: 'automation',
    iconHint: 'ChatRounded',
    color: 'var(--mantine-color-blue-5)',
    requiresFiles: true,
    quickActions: [
      { id: 'list-comments', label: 'List all comments', prompt: 'List all comments and annotations in this document.' },
      { id: 'resolve-comments', label: 'Suggest resolutions', prompt: 'Suggest how to resolve each comment.' },
    ],
  },
  {
    id: 'knowledge-generator',
    name: 'Knowledge Generator',
    shortDescription: 'Generate knowledge bases from docs',
    fullDescription:
      'Extracts knowledge from your documents and structures it into reusable knowledge bases, FAQs, or training materials.',
    category: 'automation',
    iconHint: 'SchoolRounded',
    color: 'var(--mantine-color-violet-5)',
    requiresFiles: true,
    quickActions: [
      { id: 'create-faq', label: 'Create FAQ', prompt: 'Generate an FAQ from this document.' },
      { id: 'extract-knowledge', label: 'Extract knowledge', prompt: 'Extract key knowledge points into a structured format.' },
    ],
  },
  {
    id: 'smart-routing',
    name: 'Smart Routing',
    shortDescription: 'Route documents by content & signatures',
    fullDescription:
      'Analyses document content, metadata, and signatures to automatically route documents to the right person or department.',
    category: 'automation',
    iconHint: 'AltRouteRounded',
    color: 'var(--mantine-color-orange-5)',
    requiresFiles: true,
    quickActions: [
      { id: 'detect-owner', label: 'Detect owner', prompt: 'Identify who this document should be routed to.' },
      { id: 'route-rules', label: 'Set routing rules', prompt: 'Help me set up routing rules for this type of document.' },
    ],
  },
  {
    id: 'smart-annotation',
    name: 'Smart Annotation',
    shortDescription: 'Auto-generate summaries & notes',
    fullDescription:
      'Automatically adds helpful annotations, margin notes, summaries, and highlights to your documents.',
    category: 'automation',
    iconHint: 'StickyNote2Rounded',
    color: 'var(--mantine-color-yellow-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'annotate', label: 'Auto-annotate', prompt: 'Add helpful annotations and margin notes to this document.' },
      { id: 'highlight-key', label: 'Highlight key info', prompt: 'Highlight the most important information in this document.' },
    ],
  },

  // ── File Management ──────────────────────────────────────────────────
  {
    id: 'auto-rename',
    name: 'Auto Rename',
    shortDescription: 'Rename files based on content',
    fullDescription:
      'Reads document content and automatically suggests or applies meaningful file names based on the content.',
    category: 'file-management',
    iconHint: 'DriveFileRenameOutlineRounded',
    color: 'var(--mantine-color-teal-5)',
    requiresFiles: true,
    quickActions: [
      { id: 'suggest-names', label: 'Suggest names', prompt: 'Suggest a meaningful file name based on this document\'s content.' },
      { id: 'batch-rename', label: 'Batch rename', prompt: 'Rename all documents in the workbench based on their content.' },
    ],
  },
  {
    id: 'internal-doc-prep',
    name: 'Internal Doc Prep',
    shortDescription: 'Prepare documents for internal use',
    fullDescription:
      'Prepares documents for internal distribution — adds watermarks, headers, confidentiality notices, and internal metadata.',
    category: 'file-management',
    iconHint: 'FolderSharedRounded',
    color: 'var(--mantine-color-blue-4)',
    requiresFiles: true,
    quickActions: [
      { id: 'add-watermark', label: 'Add internal watermark', prompt: 'Add an "Internal Use Only" watermark to this document.' },
      { id: 'prep-internal', label: 'Full internal prep', prompt: 'Prepare this document for internal distribution.' },
    ],
  },
  {
    id: 'external-doc-prep',
    name: 'External Doc Prep',
    shortDescription: 'Prepare documents for external sharing',
    fullDescription:
      'Cleans up documents for external sharing — removes internal comments, metadata, tracked changes, and adds appropriate branding.',
    category: 'file-management',
    iconHint: 'SendRounded',
    color: 'var(--mantine-color-green-5)',
    requiresFiles: true,
    quickActions: [
      { id: 'clean-metadata', label: 'Clean metadata', prompt: 'Remove all internal metadata and comments from this document.' },
      { id: 'prep-external', label: 'Full external prep', prompt: 'Prepare this document for external sharing.' },
    ],
  },

  // ── Security ─────────────────────────────────────────────────────────
  {
    id: 'secure-pdf',
    name: 'Secure PDF',
    shortDescription: 'Encrypt, sign & protect documents',
    fullDescription:
      'Applies security measures to your PDFs — encryption, password protection, digital signatures, and permission controls.',
    category: 'security',
    iconHint: 'SecurityRounded',
    color: 'var(--mantine-color-red-6)',
    requiresFiles: true,
    quickActions: [
      { id: 'encrypt', label: 'Encrypt document', prompt: 'Apply password encryption to this document.' },
      { id: 'set-permissions', label: 'Set permissions', prompt: 'Configure document permissions (print, copy, edit).' },
      { id: 'security-audit', label: 'Security audit', prompt: 'Audit this document\'s current security settings.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Map of agent ID → definition for O(1) lookup */
export const AGENT_MAP: Record<AgentId, AgentDefinition> = Object.fromEntries(
  AGENT_DEFINITIONS.map((a) => [a.id, a])
) as Record<AgentId, AgentDefinition>;

/** Agents grouped by category, sorted by category order */
export function getAgentsByCategory(): { category: AgentCategoryMeta; agents: AgentDefinition[] }[] {
  const catMap = new Map<AgentCategory, AgentDefinition[]>();

  for (const agent of AGENT_DEFINITIONS) {
    const list = catMap.get(agent.category) ?? [];
    list.push(agent);
    catMap.set(agent.category, list);
  }

  return AGENT_CATEGORIES
    .filter((c) => catMap.has(c.id))
    .map((c) => ({ category: c, agents: catMap.get(c.id)! }));
}

/** Search agents by name or description */
export function filterAgents(query: string): AgentDefinition[] {
  if (!query.trim()) return AGENT_DEFINITIONS;
  const q = query.toLowerCase().trim();
  return AGENT_DEFINITIONS.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.shortDescription.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
  );
}
