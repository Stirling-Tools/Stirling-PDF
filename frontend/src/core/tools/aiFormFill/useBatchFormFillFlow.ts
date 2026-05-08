/**
 * Hook for batch form filling using the typed entity system.
 *
 * Supports one-to-many: a role can have N entities assigned, producing N filled
 * outputs (one per entity). When multiple roles are multi-entity the cartesian
 * product applies (capped at MAX_VARIANTS_PER_FILE per source file).
 *
 * Outputs are added as new files in FileContext rather than mutating the source —
 * the AI Form Fill tool runs in `fileEditor` workbench so users see all variants
 * side-by-side.
 */
import { useState, useCallback } from 'react';
import { fillFormFields } from '@app/tools/formFill/formApi';
import { useFileManagement } from '@app/contexts/FileContext';
import { fillFormsBatch } from './aiFormFillApi';
import { describeError as describeErrorShared } from './errorUtils';
import { mergeEntitiesForFill, type MergeResult } from './entityTypes';
import type { Entity } from './entityTypes';
import { resolveDynamicValues } from './workflowTemplates';

const describeError = (err: unknown) => describeErrorShared(err, 'Batch fill failed.');
import type {
  FormFillBatchResponse,
  FormField,
} from './types';
import type { FormField as FullFormField } from '@app/tools/formFill/types';
import type { FormAnalysisState } from './useFormAnalysis';
import type { KnowledgeStore } from './useKnowledgeStore';

export type BatchFillPhase = 'idle' | 'filling' | 'review' | 'applying' | 'done' | 'error';

/** A single proposed fill that the user can accept, reject, or edit before apply. */
export interface ProposedFill {
  fieldName: string;
  label: string;
  /** Engine-suggested value, mutable in review. */
  value: string;
  knowledgeKey: string;
  entityName: string;
  accepted: boolean;
  /** True if the user edited the value during review. */
  edited: boolean;
}

/** Per-variant review record — one source file × one entity-combo, awaiting user approval. */
export interface ProposedVariant {
  variantId: string;
  sourceFile: StirlingFile;
  outputFileName: string;
  entityNames: string[];
  totalFillableCount: number;
  fills: ProposedFill[];
  /** Field names the engine returned no value for. */
  unfilledFieldNames: string[];
  /** Cleaned-label lookup so review UI can render readable names for unfilled too. */
  labelByFieldName: Record<string, string>;
  /** Variant-level accept toggle — when false, we skip Java fill entirely. */
  accepted: boolean;
}

interface StirlingFile extends File {
  readonly fileId: string;
}

/** Each variant is a fully-resolved fill: source file + role→single-entity assignments. */
interface VariantPlan {
  /** Source file the variant was derived from. */
  sourceFile: StirlingFile;
  /** Suffix appended to the output filename (entity names joined by `_`). */
  suffix: string;
  /** Per-role chosen entity for this variant. */
  assignments: Array<{ roleLabel: string; entity: Entity }>;
  /** Fields belonging to roles with at least one assignment. */
  fields: FullFormField[];
  /** Merged knowledge dict + provenance for the assignments. */
  mergeResult: MergeResult;
}

export interface VariantResult {
  variantId: string;
  sourceFileId: string;
  /** New file id assigned when the filled blob was added to FileContext (lets us
   *  hand the file off to another tool, e.g. the manual Form Fill tool). */
  outputFileId: string | null;
  outputFileName: string;
  filledFieldCount: number;
  /** Total fillable (non-readonly, non-skipped) fields on the source file. */
  totalFillableCount: number;
  unfilledFieldNames: string[];
  entityNames: string[];
}

export interface BatchFillState {
  phase: BatchFillPhase;
  /** Variants awaiting user review (phase='review'). */
  proposed: ProposedVariant[];
  /** Final applied variants (phase='done'). */
  results: VariantResult[];
  message: string | null;
  error: string | null;
  /** How many filled outputs the next click will produce — null when not yet computed. */
  plannedVariantCount: number | null;
}

const INITIAL_STATE: BatchFillState = {
  phase: 'idle',
  proposed: [],
  results: [],
  message: null,
  error: null,
  plannedVariantCount: null,
};

/** Sanity cap so a misclick doesn't try to fill 10,000 PDFs. */
const MAX_VARIANTS_PER_FILE = 100;

/**
 * Mirrors MathAuditorAgent._llm_semaphore (engine/.../ledger/agent.py) — bounds
 * how many filler calls can be in flight at once so a 50-variant batch doesn't
 * hammer the engine with 50 simultaneous requests.
 */
const MAX_CONCURRENT_FILLER_CALLS = 6;

type Settled<R> = { ok: true; value: R } | { ok: false; error: unknown };

/**
 * Bounded-concurrency map that collects per-item outcomes (allSettled-style).
 * One failing worker does NOT abort the rest — the caller decides what to do
 * with the failures. This matters for batch fills: a single 5xx on variant 7
 * shouldn't throw away the 49 successful variants.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Settled<R>[]> {
  const results = new Array<Settled<R>>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

// Match the engine contract caps (engine/src/stirling/contracts/form_fill.py).
const MAX_LABEL = 500;
const MAX_TOOLTIP = 1000;
const MAX_NAME = 200;
const MAX_VALUE = 2000;
const MAX_NEARBY_PAGE_TEXT = 8000;

function clamp(s: string | undefined | null, max: number): string | undefined {
  if (s == null) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}


/**
 * Expand role→entityIds[] into one assignment list per output variant.
 *
 * Cartesian (default): every combination — N×M roles produce N×M variants.
 *
 * Pair mode: zip multi-entity roles by index — N entities on each of K roles
 * produce N variants (role A's entity[i] paired with role B's entity[i]).
 * Roles with exactly 1 entity broadcast to every variant. Falls back to
 * cartesian if multi-entity role counts don't all match (UI prevents this,
 * but stay defensive).
 */
function expandAssignments(
  rolesWithEntities: Array<{ roleLabel: string; entityIds: string[] }>,
  getEntity: (id: string) => Entity | undefined,
  pairMode: boolean,
): Array<Array<{ roleLabel: string; entity: Entity }>> {
  const usable = rolesWithEntities
    .map(({ roleLabel, entityIds }) => ({
      roleLabel,
      entities: entityIds.map(getEntity).filter((e): e is Entity => !!e),
    }))
    .filter((r) => r.entities.length > 0);

  if (usable.length === 0) return [];

  if (pairMode) {
    const multiCounts = usable
      .filter((r) => r.entities.length > 1)
      .map((r) => r.entities.length);
    const allEqual =
      multiCounts.length > 0 && multiCounts.every((c) => c === multiCounts[0]);
    if (allEqual) {
      const n = multiCounts[0];
      const variants: Array<Array<{ roleLabel: string; entity: Entity }>> = [];
      for (let i = 0; i < n; i++) {
        variants.push(
          usable.map(({ roleLabel, entities }) => ({
            roleLabel,
            entity: entities.length > 1 ? entities[i] : entities[0],
          })),
        );
      }
      return variants;
    }
  }

  return usable.reduce<Array<Array<{ roleLabel: string; entity: Entity }>>>(
    (acc, { roleLabel, entities }) => {
      const next: Array<Array<{ roleLabel: string; entity: Entity }>> = [];
      for (const combo of acc) {
        for (const entity of entities) {
          next.push([...combo, { roleLabel, entity }]);
        }
      }
      return next;
    },
    [[]],
  );
}

function sanitiseForFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

function buildSuffix(assignments: Array<{ roleLabel: string; entity: Entity }>): string {
  return assignments.map((a) => sanitiseForFilename(a.entity.name)).join('_');
}

function withSuffix(originalName: string, suffix: string): string {
  if (!suffix) return originalName;
  const dot = originalName.lastIndexOf('.');
  if (dot <= 0) return `${originalName}_${suffix}`;
  return `${originalName.slice(0, dot)}_${suffix}${originalName.slice(dot)}`;
}

export function useBatchFormFillFlow(
  analysis: FormAnalysisState,
  knowledge: KnowledgeStore,
) {
  const [state, setState] = useState<BatchFillState>(INITIAL_STATE);
  const entityStore = knowledge.entityStore;
  const { addFiles } = useFileManagement();

  /** Build all variant plans — pure function over the current analysis + assignments. */
  const planVariants = useCallback(
    (
      files: StirlingFile[],
      pairMode: boolean,
    ): { plans: VariantPlan[]; warnings: string[] } => {
      if (!analysis.analysis) return { plans: [], warnings: [] };
      const warnings: string[] = [];
      const plans: VariantPlan[] = [];

      for (const file of files) {
        const fileId = file.fileId;
        const rolesForFile = analysis.analysis.crossFileRoles.filter((r) =>
          r.fileIds.includes(fileId),
        );
        if (rolesForFile.length === 0) continue;

        // Resolve role → entityIds[] (per-file override falls back to global).
        const resolved = rolesForFile.map((r) => {
          const override = analysis.fileRoleOverrides[fileId]?.[r.roleLabel];
          const entityIds =
            override && override.length > 0
              ? override
              : analysis.roleProfileMap[r.roleLabel] ?? [];
          return { roleLabel: r.roleLabel, entityIds };
        });

        const variantAssignments = expandAssignments(resolved, entityStore.getEntity, pairMode);
        if (variantAssignments.length === 0) continue;

        if (variantAssignments.length > MAX_VARIANTS_PER_FILE) {
          warnings.push(
            `${file.name}: capped at ${MAX_VARIANTS_PER_FILE} variants (asked for ${variantAssignments.length}).`,
          );
          variantAssignments.length = MAX_VARIANTS_PER_FILE;
        }

        // Fields covered by any role with an assignment.
        // Layered resolution because the engine LLM is inconsistent about which
        // keys it uses for field names:
        //  1. cross_file_roles[].fieldNamesByFile[fileId] — the canonical place.
        //  2. cross_file_roles[].fieldNamesByFile (any key) — if the LLM used
        //     a chunk id or fileName as the key.
        //  3. per_file[].detectedRoles[].fieldNames — sometimes only this is set.
        //  4. Last resort: every non-readonly field in the file. Useful when an
        //     entity is clearly assigned but the LLM's field listing was vague.
        const assignedRoleLabels = new Set(
          resolved.filter((r) => r.entityIds.length > 0).map((r) => r.roleLabel),
        );
        const allFileFields = analysis.fieldsByFile[fileId] ?? [];
        const allFieldNames = new Set(allFileFields.map((f) => f.name));
        const skipNames = new Set<string>();
        const perFile = analysis.analysis.perFile.find((p) => p.fileId === fileId);
        if (perFile) {
          for (const sn of perFile.skippedFieldNames) skipNames.add(sn);
        }

        const coveredFieldNames = new Set<string>();

        // (1) + (2): cross-file role data
        for (const r of rolesForFile) {
          if (!assignedRoleLabels.has(r.roleLabel)) continue;
          const direct = r.fieldNamesByFile[fileId];
          if (direct && direct.length > 0) {
            for (const fname of direct) coveredFieldNames.add(fname);
            continue;
          }
          for (const list of Object.values(r.fieldNamesByFile)) {
            for (const fname of list) coveredFieldNames.add(fname);
          }
        }

        // (3): per-file detected roles
        if (coveredFieldNames.size === 0 && perFile) {
          for (const role of perFile.detectedRoles) {
            if (!assignedRoleLabels.has(role.roleLabel)) continue;
            for (const fname of role.fieldNames) coveredFieldNames.add(fname);
          }
        }

        // Drop anything the LLM marked as a skipped/system field, and anything
        // the LLM hallucinated that isn't a real field.
        for (const name of [...coveredFieldNames]) {
          if (!allFieldNames.has(name) || skipNames.has(name)) {
            coveredFieldNames.delete(name);
          }
        }

        // (4): last-resort — fill every non-readonly, non-skipped field. We only
        // get here when the LLM gave us roles but no usable field lists.
        if (coveredFieldNames.size === 0) {
          for (const f of allFileFields) {
            if (!f.readOnly && !skipNames.has(f.name)) coveredFieldNames.add(f.name);
          }
          if (coveredFieldNames.size > 0) {
            warnings.push(
              `${file.name}: AI didn't list which fields belong to the assigned role(s); filling all ${coveredFieldNames.size} non-readonly fields with the assigned entity.`,
            );
          }
        }

        const fields = allFileFields.filter(
          (f) => coveredFieldNames.has(f.name) && !f.readOnly,
        );
        if (fields.length === 0) continue;

        for (const assignments of variantAssignments) {
          plans.push({
            sourceFile: file,
            suffix: buildSuffix(assignments),
            assignments,
            fields,
            mergeResult: mergeEntitiesForFill(assignments),
          });
        }
      }

      return { plans, warnings };
    },
    [analysis, entityStore],
  );

  const previewVariantCount = useCallback(
    (files: StirlingFile[], pairMode: boolean): number =>
      planVariants(files, pairMode).plans.length,
    [planVariants],
  );

  const fillAllFiles = useCallback(
    async (files: StirlingFile[], pairMode: boolean) => {
      if (!analysis.analysis) return;
      const { plans, warnings } = planVariants(files, pairMode);
      if (plans.length === 0) {
        setState((s) => ({
          ...s,
          phase: 'error',
          error: 'Nothing to fill yet — assign at least one entity to a role before filling.',
        }));
        return;
      }

      setState((s) => ({
        ...s,
        phase: 'filling',
        plannedVariantCount: plans.length,
        error: null,
      }));

      // Build cleaned-label lookup from the analysis once. Forms with non-semantic field
      // names (e.g. f_contractor_3) carry their meaning in the analyser's cleanedLabels —
      // injecting them into the request label gives the engine something to match against.
      const labelsBySourceFile: Record<string, Record<string, string>> = {};
      for (const pf of analysis.analysis?.perFile ?? []) {
        const lbl: Record<string, string> = {};
        for (const cl of pf.cleanedLabels) lbl[cl.fieldName] = cl.label;
        labelsBySourceFile[pf.fileId] = lbl;
      }

      // Page text per file persisted by the analyser — used to attach
      // nearby_page_text to each field so the filler can disambiguate generic
      // labels (e.g. "Date" near a "Contract effective date:" line).
      const pageTextsByFile = analysis.pageTextsByFile ?? {};

      try {
        // Each variant is its own /fill-batch call: knowledge differs per assignment
        // combo, and the engine treats one knowledge dict as global per request.
        // Variants are independent, so fan them out with bounded concurrency.
        const filledOutputs = await runWithConcurrency(
          plans,
          MAX_CONCURRENT_FILLER_CALLS,
          async (plan, i): Promise<{ plan: VariantPlan; response: FormFillBatchResponse }> => {
            const cleanedLabels = labelsBySourceFile[plan.sourceFile.fileId] ?? {};
            const pageTexts = pageTextsByFile[plan.sourceFile.fileId] ?? {};
            // Stable per-variant fileId so we can correlate results back.
            const variantFileId = `${plan.sourceFile.fileId}__${i}`;
            const batchRequest = {
              files: [
                {
                  fileId: variantFileId,
                  formFields: plan.fields.map((f) => {
                    const pageIndex = f.widgets?.[0]?.pageIndex;
                    const nearbyPageText =
                      pageIndex != null ? pageTexts[pageIndex] : undefined;
                    return {
                      name: clamp(f.name, MAX_NAME) ?? '',
                      label: clamp(cleanedLabels[f.name] ?? f.label, MAX_LABEL),
                      type: f.type,
                      value: clamp(f.value, MAX_VALUE),
                      options: f.options,
                      displayOptions: f.displayOptions,
                      required: f.required,
                      readOnly: f.readOnly,
                      multiSelect: f.multiSelect,
                      multiline: f.multiline,
                      tooltip: clamp(f.tooltip, MAX_TOOLTIP),
                      nearbyPageText: clamp(nearbyPageText, MAX_NEARBY_PAGE_TEXT),
                    };
                  }) as unknown as FormField[],
                  roleLabel:
                    clamp(plan.assignments[0]?.roleLabel ?? 'Primary', MAX_LABEL) ?? 'Primary',
                },
              ],
              knowledge: resolveDynamicValues(plan.mergeResult.knowledge),
            };
            const response = await fillFormsBatch(batchRequest);
            return { plan, response };
          },
        );

        // Build review proposals — engine has matched fields, user reviews/edits
        // before we touch the actual PDFs. Failed variants (HTTP errors etc.)
        // are skipped here and surfaced via the review-screen message so
        // partial successes survive.
        const proposed: ProposedVariant[] = [];
        let emptyMatchVariants = 0;
        let failedVariants = 0;
        const emptyMatchEntityNames: string[] = [];
        const failureMessages: string[] = [];

        for (let i = 0; i < filledOutputs.length; i++) {
          const settled = filledOutputs[i];
          if (!settled.ok) {
            failedVariants++;
            failureMessages.push(describeError(settled.error));
            continue;
          }
          const { plan, response } = settled.value;
          const fileResult = response.perFile[0];
          const filled = fileResult?.filledFields ?? [];
          const cleanedLabels = labelsBySourceFile[plan.sourceFile.fileId] ?? {};

          const labelByFieldName: Record<string, string> = {};
          for (const f of plan.fields) {
            labelByFieldName[f.name] = cleanedLabels[f.name] ?? f.label ?? f.name;
          }

          const filledNames = new Set(filled.map((f) => f.fieldName));

          if (filled.length === 0) {
            emptyMatchVariants++;
            for (const a of plan.assignments) emptyMatchEntityNames.push(a.entity.name);
            continue;
          }

          const provenance = plan.mergeResult.provenance;
          const fills: ProposedFill[] = filled.map((f) => ({
            fieldName: f.fieldName,
            label: labelByFieldName[f.fieldName] ?? f.fieldName,
            value: f.value,
            knowledgeKey: f.knowledgeKey,
            entityName: provenance[f.knowledgeKey]?.entityName ?? plan.assignments[0]?.entity.name ?? 'Unknown',
            accepted: true,
            edited: false,
          }));

          proposed.push({
            variantId: `${plan.sourceFile.fileId}__${i}`,
            sourceFile: plan.sourceFile,
            outputFileName: withSuffix(plan.sourceFile.name, plan.suffix),
            entityNames: plan.assignments.map((a) => a.entity.name),
            totalFillableCount: plan.fields.length,
            fills,
            unfilledFieldNames: plan.fields
              .map((f) => f.name)
              .filter((n) => !filledNames.has(n)),
            labelByFieldName,
            accepted: true,
          });
        }

        // Hard-fail only when EVERY variant either errored or matched zero
        // fields — otherwise partial successes proceed to review with a
        // message describing what was lost.
        if (proposed.length === 0) {
          if (failedVariants > 0) {
            // Only failures, no empty-matches: surface the underlying error.
            const uniq = Array.from(new Set(failureMessages));
            setState((s) => ({
              ...s,
              phase: 'error',
              error:
                `All ${failedVariants} variant${failedVariants === 1 ? '' : 's'} failed: ` +
                uniq.slice(0, 2).join('; ') +
                (uniq.length > 2 ? ` (+${uniq.length - 2} more)` : ''),
              plannedVariantCount: plans.length,
            }));
            return;
          }
          if (emptyMatchVariants > 0) {
            const uniqueEntities = Array.from(new Set(emptyMatchEntityNames));
            const summary =
              uniqueEntities.length === 1
                ? `entity "${uniqueEntities[0]}"`
                : `entities ${uniqueEntities.map((n) => `"${n}"`).join(', ')}`;
            const allEmpty = plans.every(
              (p) =>
                Object.keys(p.mergeResult.knowledge).filter((k) => !k.startsWith('_')).length === 0,
            );
            const reason = allEmpty
              ? `the assigned ${summary} ${uniqueEntities.length === 1 ? 'has' : 'have'} no fields. ` +
                `Open Manage → Entities and add fields like "first_name", "address_line_1", etc.`
              : `the AI couldn't match any of your entity fields to the form. ` +
                `Check the field names in ${summary} — try common keys like first_name, last_name, ` +
                `address_line_1, email, phone.`;
            setState((s) => ({
              ...s,
              phase: 'error',
              error: `Generated 0 filled files — ${reason}`,
              plannedVariantCount: plans.length,
            }));
            return;
          }
        }

        const reviewMessage = [
          failedVariants > 0
            ? `${failedVariants} variant${failedVariants === 1 ? '' : 's'} failed and ${
                failedVariants === 1 ? 'was' : 'were'
              } skipped`
            : null,
          emptyMatchVariants > 0
            ? `${emptyMatchVariants} variant${emptyMatchVariants === 1 ? '' : 's'} skipped (no field matches)`
            : null,
          warnings.length > 0 ? warnings.join(' ') : null,
        ]
          .filter(Boolean)
          .join('. ');

        setState((s) => ({
          ...s,
          phase: 'review',
          proposed,
          message: reviewMessage || null,
          error: null,
          plannedVariantCount: plans.length,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          phase: 'error',
          error: describeError(err),
        }));
      }
    },
    [analysis, planVariants],
  );

  /** Toggle a single proposed fill within a variant. */
  const toggleFill = useCallback((variantId: string, fieldName: string) => {
    setState((s) => ({
      ...s,
      proposed: s.proposed.map((v) =>
        v.variantId === variantId
          ? {
              ...v,
              fills: v.fills.map((f) =>
                f.fieldName === fieldName ? { ...f, accepted: !f.accepted } : f,
              ),
            }
          : v,
      ),
    }));
  }, []);

  /** Edit a proposed fill's value (also marks it accepted). */
  const editFill = useCallback(
    (variantId: string, fieldName: string, newValue: string) => {
      setState((s) => ({
        ...s,
        proposed: s.proposed.map((v) =>
          v.variantId === variantId
            ? {
                ...v,
                fills: v.fills.map((f) =>
                  f.fieldName === fieldName
                    ? { ...f, value: newValue, accepted: true, edited: f.value !== newValue }
                    : f,
                ),
              }
            : v,
        ),
      }));
    },
    [],
  );

  /** Toggle whole-variant accept (cascades to all fills). */
  const toggleVariant = useCallback((variantId: string) => {
    setState((s) => ({
      ...s,
      proposed: s.proposed.map((v) =>
        v.variantId === variantId ? { ...v, accepted: !v.accepted } : v,
      ),
    }));
  }, []);

  /** Apply currently-accepted variants/fills to PDFs and add to FileContext. */
  const applyProposed = useCallback(async () => {
    const accepted = state.proposed.filter((v) => v.accepted);
    const variantsToWrite = accepted
      .map((v) => ({ variant: v, fills: v.fills.filter((f) => f.accepted) }))
      .filter((vw) => vw.fills.length > 0);

    if (variantsToWrite.length === 0) {
      setState((s) => ({
        ...s,
        phase: 'error',
        error: 'Nothing to apply — every variant or fill is unchecked.',
      }));
      return;
    }

    setState((s) => ({ ...s, phase: 'applying' }));

    try {
      const newFiles: File[] = [];
      const variantResults: VariantResult[] = [];
      for (const { variant, fills } of variantsToWrite) {
        const valueMap: Record<string, string> = {};
        for (const fill of fills) valueMap[fill.fieldName] = fill.value;

        const filledBlob = await fillFormFields(variant.sourceFile, valueMap, false);
        newFiles.push(
          new File([filledBlob], variant.outputFileName, {
            type: filledBlob.type || 'application/pdf',
            lastModified: Date.now(),
          }),
        );
        const unfilledFieldNames = [
          ...variant.unfilledFieldNames,
          ...variant.fills.filter((f) => !f.accepted).map((f) => f.fieldName),
        ];
        variantResults.push({
          variantId: variant.variantId,
          sourceFileId: variant.sourceFile.fileId,
          outputFileId: null,
          outputFileName: variant.outputFileName,
          filledFieldCount: fills.length,
          totalFillableCount: variant.totalFillableCount,
          unfilledFieldNames,
          entityNames: variant.entityNames,
        });
      }

      if (newFiles.length > 0) {
        const added = await addFiles(newFiles, { selectFiles: false });
        for (let j = 0; j < added.length && j < variantResults.length; j++) {
          const sf = added[j];
          if (sf && 'fileId' in sf) {
            variantResults[j].outputFileId = (sf as { fileId: string }).fileId;
          }
        }
      }

      const skippedVariants = state.proposed.length - variantsToWrite.length;
      const message = [
        `Applied ${variantResults.length} filled file${variantResults.length === 1 ? '' : 's'}`,
        skippedVariants > 0 ? `(${skippedVariants} variant${skippedVariants === 1 ? '' : 's'} skipped at review)` : null,
      ]
        .filter(Boolean)
        .join('. ');

      setState((s) => ({
        ...s,
        phase: 'done',
        proposed: [],
        results: variantResults,
        message,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: 'error',
        error: describeError(err),
      }));
    }
  }, [state.proposed, addFiles]);

  /** Discard the current review and return to analysis. */
  const cancelReview = useCallback(() => {
    setState((s) => ({
      ...s,
      phase: 'idle',
      proposed: [],
      message: null,
      error: null,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    fillAllFiles,
    previewVariantCount,
    toggleFill,
    editFill,
    toggleVariant,
    applyProposed,
    cancelReview,
    reset,
  };
}
