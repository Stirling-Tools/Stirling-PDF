/**
 * Saved workflow templates — remember form + role + entity mappings for repeat use.
 * Also handles dynamic values ({{today}}, date formatting) and quick fill.
 *
 * Server-side storage is used via {@link useWorkflowStore} when the user is logged in;
 * {@link createWorkflowStore} remains the local-only factory for anonymous contexts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@app/auth/UseSession';
import {
  fetchWorkflowTemplates,
  upsertWorkflowTemplate,
  touchWorkflowTemplateRemote,
  deleteWorkflowTemplateRemote,
} from './workflowTemplateApiClient';

const TEMPLATES_STORAGE_KEY = 'stirling-pdf-ai-workflows';

export interface WorkflowTemplate {
  id: string;
  name: string;
  /** Hash of the form field structure — identifies the form type */
  formSignature: string;
  /** Role → entity ID mappings */
  roleEntityMap: Record<string, string>;
  /** Per-file overrides (fileSignature → role → entityId) */
  fileOverrides: Record<string, Record<string, string>>;
  createdAt: number;
  lastUsedAt: number;
}

export interface WorkflowStore {
  templates: WorkflowTemplate[];
  findBySignature: (signature: string) => WorkflowTemplate | undefined;
  save: (template: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'lastUsedAt'>) => WorkflowTemplate;
  updateLastUsed: (id: string) => void;
  remove: (id: string) => void;
  removeAll: () => void;
}

/** Generate a signature from form field names to identify a form type */
export function generateFormSignature(fieldNames: string[]): string {
  const sorted = [...fieldNames].sort();
  // Simple hash — use first 20 field names joined, then hash
  const source = sorted.slice(0, 20).join('|');
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `form_${Math.abs(hash).toString(36)}`;
}

function loadTemplates(): WorkflowTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: WorkflowTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch { /* QuotaExceededError */ }
}

export function createWorkflowStore(): WorkflowStore {
  let templates = loadTemplates();

  return {
    get templates() { return templates; },

    findBySignature(signature: string) {
      return templates.find((t) => t.formSignature === signature);
    },

    save(template) {
      const full: WorkflowTemplate = {
        ...template,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };
      templates = [...templates, full];
      saveTemplates(templates);
      return full;
    },

    updateLastUsed(id: string) {
      templates = templates.map((t) =>
        t.id === id ? { ...t, lastUsedAt: Date.now() } : t
      );
      saveTemplates(templates);
    },

    remove(id: string) {
      templates = templates.filter((t) => t.id !== id);
      saveTemplates(templates);
    },

    removeAll() {
      templates = [];
      saveTemplates(templates);
    },
  };
}

/**
 * React hook variant of {@link createWorkflowStore} that syncs with the server-side store when
 * the user is authenticated. Follows the same pattern as {@code useEntityStore}: local-first for
 * synchronous UI, server mutations fired in the background, server state wins on hydrate.
 */
export function useWorkflowStore(): WorkflowStore {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(() => loadTemplates());
  const templatesRef = useRef(templates);
  templatesRef.current = templates;

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchWorkflowTemplates();
        if (cancelled) return;
        if (remote.length > 0) {
          setTemplates(remote);
          saveTemplates(remote);
        } else if (templatesRef.current.length > 0) {
          for (const t of templatesRef.current) {
            upsertWorkflowTemplate(t).catch(() => {});
          }
        }
      } catch {
        /* offline / unauthorised — keep local state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const persist = useCallback((next: WorkflowTemplate[]) => {
    setTemplates(next);
    saveTemplates(next);
  }, []);

  const findBySignature = useCallback(
    (signature: string) => templates.find((t) => t.formSignature === signature),
    [templates],
  );

  const save = useCallback(
    (template: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'lastUsedAt'>): WorkflowTemplate => {
      const full: WorkflowTemplate = {
        ...template,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };
      persist([...templatesRef.current, full]);
      if (isAuthenticated) upsertWorkflowTemplate(full).catch(() => {});
      return full;
    },
    [persist, isAuthenticated],
  );

  const updateLastUsed = useCallback(
    (id: string) => {
      persist(
        templatesRef.current.map((t) =>
          t.id === id ? { ...t, lastUsedAt: Date.now() } : t,
        ),
      );
      if (isAuthenticated) touchWorkflowTemplateRemote(id).catch(() => {});
    },
    [persist, isAuthenticated],
  );

  const remove = useCallback(
    (id: string) => {
      persist(templatesRef.current.filter((t) => t.id !== id));
      if (isAuthenticated) deleteWorkflowTemplateRemote(id).catch(() => {});
    },
    [persist, isAuthenticated],
  );

  const removeAll = useCallback(() => {
    const ids = templatesRef.current.map((t) => t.id);
    persist([]);
    if (isAuthenticated) {
      for (const id of ids) deleteWorkflowTemplateRemote(id).catch(() => {});
    }
  }, [persist, isAuthenticated]);

  return {
    get templates() {
      return templates;
    },
    findBySignature,
    save,
    updateLastUsed,
    remove,
    removeAll,
  };
}

// --- Dynamic Values ---

const DYNAMIC_PATTERNS: Record<string, () => string> = {
  '{{today}}': () => new Date().toISOString().split('T')[0],
  '{{today_uk}}': () => {
    const d = new Date();
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  },
  '{{today_us}}': () => {
    const d = new Date();
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
  },
  '{{today_long}}': () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  '{{year}}': () => new Date().getFullYear().toString(),
};

/** Resolve dynamic value patterns in entity field values */
export function resolveDynamicValues(knowledge: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(knowledge)) {
    let resolvedValue = value;
    for (const [pattern, resolver] of Object.entries(DYNAMIC_PATTERNS)) {
      if (resolvedValue.includes(pattern)) {
        resolvedValue = resolvedValue.replace(pattern, resolver());
      }
    }
    resolved[key] = resolvedValue;
  }
  return resolved;
}

// --- Expiry Date Checking ---

export interface ExpiryWarning {
  entityName: string;
  fieldKey: string;
  expiryDate: string;
  daysUntilExpiry: number;
  isExpired: boolean;
}

/** Check all entities for expiring certifications/fields */
export function checkExpiryDates(
  entities: Array<{ name: string; fields: Record<string, string> }>,
  warningDaysThreshold: number = 30
): ExpiryWarning[] {
  const warnings: ExpiryWarning[] = [];
  const expiryKeyPatterns = ['expiry_date', 'expiration_date', 'expires', 'valid_until', 'renewal_date'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const entity of entities) {
    for (const [key, value] of Object.entries(entity.fields)) {
      const isExpiryField = expiryKeyPatterns.some((p) => key.toLowerCase().includes(p));
      if (!isExpiryField) continue;

      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) continue;

      parsed.setHours(0, 0, 0, 0);
      const diffMs = parsed.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= warningDaysThreshold) {
        warnings.push({
          entityName: entity.name,
          fieldKey: key,
          expiryDate: value,
          daysUntilExpiry: diffDays,
          isExpired: diffDays < 0,
        });
      }
    }
  }

  return warnings.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

// --- Cross-Form Consistency ---

export interface ConsistencyIssue {
  fieldLabel: string;
  values: Array<{ fileId: string; fileName: string; value: string }>;
  suggestedValue: string;
}

/** Check for inconsistent values across files for the same field */
export function checkCrossFormConsistency(
  fillResults: Array<{ fileId: string; fileName: string; filledFields: Array<{ fieldName: string; value: string }> }>
): ConsistencyIssue[] {
  // Group values by field name (normalized)
  const fieldValues: Record<string, Array<{ fileId: string; fileName: string; value: string }>> = {};

  for (const result of fillResults) {
    for (const field of result.filledFields) {
      const normalizedName = field.fieldName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      if (!fieldValues[normalizedName]) fieldValues[normalizedName] = [];
      fieldValues[normalizedName].push({
        fileId: result.fileId,
        fileName: result.fileName,
        value: field.value,
      });
    }
  }

  // Find fields that appear in multiple files with different values
  const issues: ConsistencyIssue[] = [];
  for (const [fieldName, entries] of Object.entries(fieldValues)) {
    if (entries.length < 2) continue;
    const uniqueValues = [...new Set(entries.map((e) => e.value))];
    if (uniqueValues.length <= 1) continue;

    // Most common value is the suggestion
    const valueCounts = new Map<string, number>();
    for (const e of entries) {
      valueCounts.set(e.value, (valueCounts.get(e.value) || 0) + 1);
    }
    const suggestedValue = [...valueCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    issues.push({
      fieldLabel: fieldName,
      values: entries,
      suggestedValue,
    });
  }

  return issues;
}
