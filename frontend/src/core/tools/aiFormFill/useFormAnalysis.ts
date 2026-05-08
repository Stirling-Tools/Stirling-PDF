/**
 * Hook for the Form Analysis phase.
 * Fetches fields for all files, extracts page text, sends to AI analyser,
 * stores analysis result with role-grouped data.
 */
import { useState, useCallback } from 'react';
import { fetchFormFieldsWithCoordinates } from '@app/tools/formFill/formApi';
import { extractPageTexts } from './pdfTextExtraction';
import { analyseMultipleForms } from './aiFormFillApi';
import { describeError as describeErrorShared } from './errorUtils';
import type {
  AnalysedFileResult,
  CrossFileRole,
  FormAnalysisResponse,
  FormField,
} from './types';
import type { FormField as FullFormField } from '@app/tools/formFill/types';
import type { KnowledgeStore } from './useKnowledgeStore';

const describeError = (err: unknown) => describeErrorShared(err, 'Form analysis failed.');

export type AnalysisPhase = 'idle' | 'fetching_fields' | 'analysing' | 'done' | 'error';

export interface FormAnalysisState {
  phase: AnalysisPhase;
  /** Raw fields fetched from Java backend, keyed by fileId */
  fieldsByFile: Record<string, FullFormField[]>;
  /**
   * Page text per file, keyed by fileId then by pageIndex. Persisted so the
   * fill phase can attach nearby_page_text to fields without re-running pdf.js.
   */
  pageTextsByFile: Record<string, Record<number, string>>;
  /** AI analysis result */
  analysis: FormAnalysisResponse | null;
  /**
   * Role → list of entity IDs assigned to that role. A role with N entities yields N
   * filled outputs (one per entity); when multiple roles each have N entities, the
   * cartesian product applies.
   */
  roleProfileMap: Record<string, string[]>;
  /** Per-file role overrides: fileId → roleLabel → list of entity IDs */
  fileRoleOverrides: Record<string, Record<string, string[]>>;
  error: string | null;
}

const INITIAL_STATE: FormAnalysisState = {
  phase: 'idle',
  fieldsByFile: {},
  pageTextsByFile: {},
  analysis: null,
  roleProfileMap: {},
  fileRoleOverrides: {},
  error: null,
};

interface StirlingFile extends File {
  readonly fileId: string;
}

// Match the engine contract caps (engine/src/stirling/contracts/form_fill.py).
// We truncate client-side so a verbose PDF doesn't trigger a 422.
const MAX_NEARBY_PAGE_TEXT = 8000;
const MAX_LABEL = 500;
const MAX_TOOLTIP = 1000;
const MAX_NAME = 200;
const MAX_VALUE = 2000;
const MAX_TYPE = 50;
const MAX_FILE_ID = 200;
const MAX_FILE_NAME = 500;
/**
 * Threshold for splitting one logical file into multiple synthetic chunks
 * before the analyse call. Sonnet 4.6 has a 200K context and the new phase-1
 * prompt no longer enumerates every field, so chunking is mostly a safety net
 * for genuinely huge forms. 1500 stays under the engine's MAX_FIELDS_PER_FILE
 * (2000) with headroom for prompt overhead. See AI_LAYERS_REVIEW.md.
 */
const FIELDS_PER_CHUNK = 1500;

/**
 * Frontend-only upper bound on a single PDF — beyond this we refuse rather than
 * fan analyse into many LLM calls. Independent of the server-side
 * MAX_FIELDS_PER_FILE cap (which only sees one chunk at a time).
 */
const MAX_FIELDS_FOR_CHUNKED_ANALYSIS = 6000;

function clamp(s: string | undefined | null, max: number): string | undefined {
  if (s == null) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}


/**
 * Best-effort fill-in of analysis data the LLM occasionally leaves empty.
 *
 * The smart model is inconsistent about where it puts field names: sometimes
 * `cross_file_roles[].fieldNamesByFile` has them, sometimes only
 * `per_file[].detectedRoles[].fieldNames` does, sometimes neither (the model
 * names roles in prose but skips populating the structured arrays).
 *
 * We patch this client-side so the UI and fill path can both rely on a fully
 * populated `fieldNamesByFile`. Order of preference:
 *   1. Whatever the LLM gave us already.
 *   2. Per-file detected role field names for the same role label.
 *   3. As a last resort, every non-skipped, non-readonly field on the file
 *      gets attached to the primary role on that file. Tagged with a warning
 *      so the caller can surface "AI didn't enumerate fields" to the user.
 */
function normaliseAnalysis(
  analysis: FormAnalysisResponse,
  fieldsByFile: Record<string, FullFormField[]>,
): { analysis: FormAnalysisResponse; warnings: string[] } {
  const warnings: string[] = [];

  // Build per-file role → fieldNames lookup from the per-file shape.
  const perFileRoleFields: Record<string, Record<string, Set<string>>> = {};
  const skippedByFile: Record<string, Set<string>> = {};
  for (const pf of analysis.perFile) {
    skippedByFile[pf.fileId] = new Set(pf.skippedFieldNames);
    const roleMap: Record<string, Set<string>> = {};
    for (const role of pf.detectedRoles) {
      const existing = roleMap[role.roleLabel] ?? new Set<string>();
      for (const name of role.fieldNames) existing.add(name);
      roleMap[role.roleLabel] = existing;
    }
    perFileRoleFields[pf.fileId] = roleMap;
  }

  // Patch cross-file roles — fill in fieldNamesByFile for any (role × file)
  // combo the LLM left blank.
  const crossFileRoles = analysis.crossFileRoles.map((role) => {
    const updated: Record<string, string[]> = {};
    for (const fileId of role.fileIds) {
      const existing = role.fieldNamesByFile[fileId];
      if (existing && existing.length > 0) {
        updated[fileId] = [...existing];
        continue;
      }
      const fromPerFile = perFileRoleFields[fileId]?.[role.roleLabel];
      if (fromPerFile && fromPerFile.size > 0) {
        updated[fileId] = [...fromPerFile];
      }
    }
    // Carry over any keys the LLM provided that aren't in fileIds (rare, but
    // protects against the LLM keying by fileName etc.).
    for (const [k, v] of Object.entries(role.fieldNamesByFile)) {
      if (updated[k] == null && v.length > 0) updated[k] = [...v];
    }
    return { ...role, fieldNamesByFile: updated };
  });

  // Identify orphan fields — fillable on the file, not skipped, not in any
  // role's list anywhere. Attach them to the primary cross-file role on that
  // file. If no primary, attach to the first role.
  for (const pf of analysis.perFile) {
    const fileFields = fieldsByFile[pf.fileId] ?? [];
    if (fileFields.length === 0) continue;

    const skipped = skippedByFile[pf.fileId] ?? new Set();
    const claimed = new Set<string>();
    for (const role of crossFileRoles) {
      for (const name of role.fieldNamesByFile[pf.fileId] ?? []) claimed.add(name);
    }
    const orphans = fileFields
      .filter((f) => !f.readOnly && !skipped.has(f.name) && !claimed.has(f.name))
      .map((f) => f.name);
    if (orphans.length === 0) continue;

    let target = crossFileRoles.find(
      (r) => r.fileIds.includes(pf.fileId) && r.isPrimaryPerson,
    );
    if (!target) {
      target = crossFileRoles.find((r) => r.fileIds.includes(pf.fileId));
    }
    if (!target) continue;

    const list = target.fieldNamesByFile[pf.fileId] ?? [];
    target.fieldNamesByFile = {
      ...target.fieldNamesByFile,
      [pf.fileId]: Array.from(new Set([...list, ...orphans])),
    };
    warnings.push(
      `${pf.fileName}: AI left ${orphans.length} fillable field${orphans.length === 1 ? '' : 's'} unassigned — attached to "${target.roleLabel}".`,
    );
  }

  return {
    analysis: { ...analysis, crossFileRoles },
    warnings,
  };
}

/**
 * Stable suffix marker for synthetic chunk file ids. Keep it long enough that
 * a real fileId is unlikely to contain it accidentally.
 */
const CHUNK_SUFFIX = '__chunk-aiform-';
const CHUNK_RE = new RegExp(`${CHUNK_SUFFIX}\\d+$`);

function chunkFileId(realFileId: string, chunkIdx: number): string {
  return `${realFileId}${CHUNK_SUFFIX}${chunkIdx}`;
}

function resolveChunkId(maybeChunkId: string): string {
  return maybeChunkId.replace(CHUNK_RE, '');
}

/**
 * Collapse a chunked analyse response back into one entry per logical file.
 * - per_file entries with the same logical fileId are merged: detectedRoles by
 *   role label, cleanedLabels and skippedFieldNames concatenated.
 * - cross_file_roles' fileIds and fieldNamesByFile are remapped to logical ids.
 */
function mergeChunkedAnalysis(
  analysis: FormAnalysisResponse,
  realFileNames: Record<string, string>,
): FormAnalysisResponse {
  const perFileByLogical: Record<string, AnalysedFileResult> = {};

  for (const pf of analysis.perFile) {
    const logicalId = resolveChunkId(pf.fileId);
    const existing = perFileByLogical[logicalId];
    if (!existing) {
      perFileByLogical[logicalId] = {
        fileId: logicalId,
        fileName: realFileNames[logicalId] ?? pf.fileName,
        detectedRoles: pf.detectedRoles.map((r) => ({ ...r, fieldNames: [...r.fieldNames] })),
        cleanedLabels: [...pf.cleanedLabels],
        skippedFieldNames: [...pf.skippedFieldNames],
      };
      continue;
    }
    for (const role of pf.detectedRoles) {
      const existingRole = existing.detectedRoles.find((r) => r.roleLabel === role.roleLabel);
      if (existingRole) {
        existingRole.fieldNames = Array.from(
          new Set([...existingRole.fieldNames, ...role.fieldNames]),
        );
        // Keep primary if either chunk says so.
        existingRole.isPrimaryPerson ||= role.isPrimaryPerson;
      } else {
        existing.detectedRoles.push({ ...role, fieldNames: [...role.fieldNames] });
      }
    }
    existing.cleanedLabels.push(...pf.cleanedLabels);
    existing.skippedFieldNames.push(...pf.skippedFieldNames);
  }

  const crossFileRoles: CrossFileRole[] = analysis.crossFileRoles.map((role) => {
    const fileIds = Array.from(new Set(role.fileIds.map(resolveChunkId)));
    const fieldNamesByFile: Record<string, string[]> = {};
    for (const [chunkId, fieldNames] of Object.entries(role.fieldNamesByFile)) {
      const logicalId = resolveChunkId(chunkId);
      const acc = fieldNamesByFile[logicalId] ?? [];
      for (const name of fieldNames) {
        if (!acc.includes(name)) acc.push(name);
      }
      fieldNamesByFile[logicalId] = acc;
    }
    return { ...role, fileIds, fieldNamesByFile };
  });

  return {
    outcome: 'form_analysis',
    perFile: Object.values(perFileByLogical),
    crossFileRoles,
    message: analysis.message,
  };
}

function buildFieldForAi(field: FullFormField, pageTexts: Record<number, string>): FormField {
  const pageIndex = field.widgets?.[0]?.pageIndex;
  const nearbyText = pageIndex != null ? pageTexts[pageIndex] : undefined;
  return {
    name: clamp(field.name, MAX_NAME) ?? '',
    label: clamp(field.label, MAX_LABEL),
    type: clamp(field.type, MAX_TYPE) ?? 'text',
    value: clamp(field.value, MAX_VALUE),
    options: field.options,
    displayOptions: field.displayOptions,
    required: field.required,
    readOnly: field.readOnly,
    multiSelect: field.multiSelect,
    multiline: field.multiline,
    tooltip: clamp(field.tooltip, MAX_TOOLTIP),
    nearbyPageText: clamp(nearbyText, MAX_NEARBY_PAGE_TEXT),
  } as unknown as FormField;
}

export function useFormAnalysis(knowledge: KnowledgeStore) {
  const [state, setState] = useState<FormAnalysisState>(INITIAL_STATE);

  const analyseAllFiles = useCallback(async (files: StirlingFile[]) => {
    setState((s) => ({ ...s, phase: 'fetching_fields', error: null }));
    try {
      // Step 1: Fetch fields for all files from Java backend (parallel)
      const fieldsByFile: Record<string, FullFormField[]> = {};
      await Promise.all(
        files.map(async (sf) => {
          fieldsByFile[sf.fileId] = await fetchFormFieldsWithCoordinates(sf);
        })
      );

      // Refuse upfront when no file has any fields — saves a wasted analyse call
      // and gives the user a useful message instead of the LLM's "no fields detected".
      const totalFields = Object.values(fieldsByFile).reduce((acc, arr) => acc + arr.length, 0);
      if (totalFields === 0) {
        throw new Error(
          'No fillable form fields were detected in this file. If the file came from "Split PDF", AcroForm fields are sometimes lost during split — try analysing the original unsplit document, or use a tool that preserves form fields.',
        );
      }

      // Step 2: Extract page texts per file (parallel)
      const pageTextsByFile: Record<string, Record<number, string>> = {};
      await Promise.all(
        files.map(async (sf) => {
          try {
            pageTextsByFile[sf.fileId] = await extractPageTexts(sf);
          } catch {
            // Non-critical
          }
        })
      );

      setState((s) => ({ ...s, phase: 'analysing', fieldsByFile }));

      // Step 3: Refuse hopelessly oversized files upfront — beyond the cap we fan
      // into multiple chunked LLM calls; users should split the document first.
      const oversized = files.find(
        (sf) => (fieldsByFile[sf.fileId] ?? []).length > MAX_FIELDS_FOR_CHUNKED_ANALYSIS,
      );
      if (oversized) {
        const count = (fieldsByFile[oversized.fileId] ?? []).length;
        throw new Error(
          `${oversized.name} has ${count} form fields, which exceeds the ${MAX_FIELDS_FOR_CHUNKED_ANALYSIS}-field cap. ` +
            `Split the document into smaller forms first (Tools → Split PDF) and re-analyse.`,
        );
      }

      // Step 4: Build the analyse request, chunking files with > FIELDS_PER_CHUNK
      // fields into multiple synthetic file entries. Tracks the real file name so
      // we can rebuild a per-logical-file response after the call.
      const realFileNames: Record<string, string> = {};
      const requestFiles: Array<{
        fileId: string;
        fileName: string;
        formFields: FormField[];
      }> = [];
      let totalChunks = 0;
      for (const sf of files) {
        const realFileId = clamp(sf.fileId, MAX_FILE_ID) ?? sf.fileId;
        const realFileName = clamp(sf.name, MAX_FILE_NAME) ?? sf.name;
        realFileNames[realFileId] = realFileName;
        const pageTexts = pageTextsByFile[sf.fileId] || {};
        const allFields = fieldsByFile[sf.fileId] || [];

        if (allFields.length <= FIELDS_PER_CHUNK) {
          requestFiles.push({
            fileId: realFileId,
            fileName: realFileName,
            formFields: allFields.map((f) => buildFieldForAi(f, pageTexts)),
          });
          continue;
        }

        const chunkCount = Math.ceil(allFields.length / FIELDS_PER_CHUNK);
        for (let i = 0; i < chunkCount; i++) {
          const start = i * FIELDS_PER_CHUNK;
          const end = Math.min(start + FIELDS_PER_CHUNK, allFields.length);
          requestFiles.push({
            fileId: chunkFileId(realFileId, i),
            fileName: `${realFileName} (part ${i + 1}/${chunkCount})`,
            formFields: allFields.slice(start, end).map((f) => buildFieldForAi(f, pageTexts)),
          });
        }
        totalChunks += chunkCount;
      }

      // Step 5: Call analyser (one request, possibly with chunked synthetic files)
      const rawWorkflowResponse = await analyseMultipleForms({ files: requestFiles });

      // The analyser can refuse via FormAnalysisAmbiguousResponse — same pattern
      // as PdfEditAgent's EditClarificationRequest. Surface the LLM's reason
      // instead of silently fabricating roles.
      if (rawWorkflowResponse.outcome === 'form_analysis_ambiguous') {
        const reason = rawWorkflowResponse.reason;
        const suggestion = rawWorkflowResponse.suggestion
          ? ` ${rawWorkflowResponse.suggestion}`
          : '';
        throw new Error(`AI couldn't analyse this form: ${reason}${suggestion}`);
      }

      const rawAnalysis = rawWorkflowResponse;
      const merged =
        totalChunks > 0 ? mergeChunkedAnalysis(rawAnalysis, realFileNames) : rawAnalysis;
      // Step 5b: Patch up empty / missing field assignments before anything
      // downstream (UI, fill plan) reads the response.
      const { analysis: normalised, warnings } = normaliseAnalysis(merged, fieldsByFile);
      const analysis: FormAnalysisResponse = warnings.length
        ? { ...normalised, message: [normalised.message, ...warnings].filter(Boolean).join(' ') }
        : normalised;

      // Step 6: Auto-assign primary roles to the default entity. Using the entity ID
      // (not the name) so MultiSelect / planVariants / getEntity all line up.
      const initialRoleMap: Record<string, string[]> = {};
      const defaultId = knowledge.entityStore.defaultEntityId;
      if (defaultId) {
        for (const role of analysis.crossFileRoles) {
          if (role.isPrimaryPerson) {
            initialRoleMap[role.roleLabel] = [defaultId];
          }
        }
      }

      setState((s) => ({
        ...s,
        phase: 'done',
        analysis,
        pageTextsByFile,
        roleProfileMap: initialRoleMap,
        fileRoleOverrides: {},
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: 'error',
        error: describeError(err),
      }));
    }
  }, [knowledge.entityStore.defaultEntityId]);

  const setRoleProfiles = useCallback((roleLabel: string, entityIds: string[]) => {
    setState((s) => ({
      ...s,
      roleProfileMap: { ...s.roleProfileMap, [roleLabel]: entityIds },
    }));
  }, []);

  const setFileRoleOverride = useCallback(
    (fileId: string, roleLabel: string, entityIds: string[]) => {
      setState((s) => ({
        ...s,
        fileRoleOverrides: {
          ...s.fileRoleOverrides,
          [fileId]: { ...(s.fileRoleOverrides[fileId] || {}), [roleLabel]: entityIds },
        },
      }));
    },
    []
  );

  const clearFileRoleOverride = useCallback((fileId: string, roleLabel: string) => {
    setState((s) => {
      const overrides = { ...s.fileRoleOverrides };
      if (overrides[fileId]) {
        const roleOverrides = { ...overrides[fileId] };
        delete roleOverrides[roleLabel];
        if (Object.keys(roleOverrides).length === 0) {
          delete overrides[fileId];
        } else {
          overrides[fileId] = roleOverrides;
        }
      }
      return { ...s, fileRoleOverrides: overrides };
    });
  }, []);

  const getEffectiveProfiles = useCallback(
    (fileId: string, roleLabel: string): string[] => {
      const override = state.fileRoleOverrides[fileId]?.[roleLabel];
      if (override && override.length > 0) return override;
      return state.roleProfileMap[roleLabel] ?? [];
    },
    [state.fileRoleOverrides, state.roleProfileMap]
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    analyseAllFiles,
    setRoleProfiles,
    setFileRoleOverride,
    clearFileRoleOverride,
    getEffectiveProfiles,
    reset,
  };
}
