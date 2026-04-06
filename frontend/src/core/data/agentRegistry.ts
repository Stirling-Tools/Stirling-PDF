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
  | 'stirling-general'
  | 'document-summary'
  | 'advanced-redaction';

export type AgentCategory =
  | 'general'
  | 'intelligence'
  | 'editing';

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
  /** If true, this agent has a working backend implementation. Unimplemented agents are greyed out. */
  implemented?: boolean;
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
];

// ---------------------------------------------------------------------------
// Agent definitions
// ---------------------------------------------------------------------------

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  // ── General ──────────────────────────────────────────────────────────
  {
    id: 'stirling-general',
    name: 'Stirling',
    implemented: true,
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
    id: 'document-summary',
    name: 'Document Summary',
    implemented: true,
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

  // ── Editing & Transformation ─────────────────────────────────────────
  {
    id: 'advanced-redaction',
    name: 'Advanced Redaction',
    implemented: true,
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
];

// Future agents will be added here as their backends are implemented.

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
