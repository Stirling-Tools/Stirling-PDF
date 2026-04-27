/**
 * Hook for batch form filling using the typed entity system.
 * Merges entities for multi-entity filling. Includes fill preview phase.
 */
import { useState, useCallback } from 'react';
import { fillFormFields } from '@app/tools/formFill/formApi';
import { fillFormsBatch } from './aiFormFillApi';
import { mergeEntitiesForFill, type MergeResult } from './entityTypes';
import { resolveDynamicValues } from './workflowTemplates';
import type {
  FileFillResult,
  FormFillBatchResponse,
  FormField,
  FieldMapping,
} from './types';
import type { FormField as FullFormField } from '@app/tools/formFill/types';
import type { FormAnalysisState } from './useFormAnalysis';
import type { KnowledgeStore } from './useKnowledgeStore';

export type BatchFillPhase = 'idle' | 'filling' | 'preview' | 'applying' | 'done' | 'error';

interface StirlingFile extends File {
  readonly fileId: string;
}

export interface PreviewField {
  fileId: string;
  fieldName: string;
  value: string;
  entityName: string;
  accepted: boolean;
}

export interface BatchFillState {
  phase: BatchFillPhase;
  results: FileFillResult[];
  previewFields: PreviewField[];
  message: string | null;
  error: string | null;
}

const INITIAL_STATE: BatchFillState = {
  phase: 'idle',
  results: [],
  previewFields: [],
  message: null,
  error: null,
};

export function useBatchFormFillFlow(
  analysis: FormAnalysisState,
  knowledge: KnowledgeStore
) {
  const [state, setState] = useState<BatchFillState>(INITIAL_STATE);
  const entityStore = knowledge.entityStore;

  const fillAllFiles = useCallback(
    async (files: StirlingFile[]) => {
      if (!analysis.analysis) return;
      setState((s) => ({ ...s, phase: 'filling', error: null }));

      try {
        // Build per-file fill requests using entity merge
        // Group files by their set of role→entity assignments (to batch efficiently)
        const fileRequests: Array<{
          fileId: string;
          fields: FullFormField[];
          roleLabel: string;
          mergeResult: MergeResult;
        }> = [];

        for (const role of analysis.analysis.crossFileRoles) {
          for (const fileId of role.fileIds) {
            const entityId =
              analysis.fileRoleOverrides[fileId]?.[role.roleLabel] ||
              analysis.roleProfileMap[role.roleLabel];
            if (!entityId) continue;

            const entity = entityStore.getEntity(entityId);
            if (!entity) continue;

            const roleFieldNames = new Set(role.fieldNamesByFile[fileId] || []);
            const fileFields = (analysis.fieldsByFile[fileId] || []).filter(
              (f) => roleFieldNames.has(f.name) && !f.readOnly
            );
            if (fileFields.length === 0) continue;

            // Collect ALL entity assignments for this file (across all roles)
            const allAssignments = analysis.analysis.crossFileRoles
              .filter((r) => r.fileIds.includes(fileId))
              .map((r) => {
                const eid =
                  analysis.fileRoleOverrides[fileId]?.[r.roleLabel] ||
                  analysis.roleProfileMap[r.roleLabel];
                const ent = eid ? entityStore.getEntity(eid) : undefined;
                return ent ? { roleLabel: r.roleLabel, entity: ent } : null;
              })
              .filter(Boolean) as Array<{ roleLabel: string; entity: any }>;

            const mergeResult = mergeEntitiesForFill(allAssignments);

            fileRequests.push({
              fileId,
              fields: fileFields,
              roleLabel: role.roleLabel,
              mergeResult,
            });
          }
        }

        // Deduplicate by fileId (a file may appear in multiple roles)
        const seen = new Set<string>();
        const dedupedRequests = fileRequests.filter((fr) => {
          if (seen.has(fr.fileId)) return false;
          seen.add(fr.fileId);
          return true;
        });

        if (dedupedRequests.length === 0) {
          setState((s) => ({
            ...s,
            phase: 'error',
            error:
              'Nothing to fill yet — assign an entity to at least one role before filling.',
          }));
          return;
        }

        // Build batch request — one entry per file, with merged knowledge
        const rawKnowledge = dedupedRequests[0]?.mergeResult.knowledge || {};
        const batchRequest = {
          files: dedupedRequests.map((fr) => ({
            fileId: fr.fileId,
            formFields: fr.fields.map((f) => ({
              name: f.name,
              label: f.label,
              type: f.type,
              value: f.value,
              options: f.options,
              displayOptions: f.displayOptions,
              required: f.required,
              readOnly: f.readOnly,
              multiSelect: f.multiSelect,
              multiline: f.multiline,
              tooltip: f.tooltip,
            })) as unknown as FormField[],
            roleLabel: fr.roleLabel,
          })),
          knowledge: resolveDynamicValues(rawKnowledge),
        };

        const response: FormFillBatchResponse = await fillFormsBatch(batchRequest);

        // Build preview data with provenance
        const previewFields: PreviewField[] = [];
        for (const fileResult of response.perFile) {
          const req = dedupedRequests.find((r) => r.fileId === fileResult.fileId);
          for (const fill of fileResult.filledFields) {
            const prov = req?.mergeResult.provenance[fill.knowledgeKey];
            previewFields.push({
              fileId: fileResult.fileId,
              fieldName: fill.fieldName,
              value: fill.value,
              entityName: prov?.entityName || 'Unknown',
              accepted: true,
            });
          }
        }

        setState({
          phase: 'preview',
          results: response.perFile,
          previewFields,
          message: response.message,
          error: null,
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          phase: 'error',
          error: err instanceof Error ? err.message : 'Batch fill failed.',
        }));
      }
    },
    [analysis, entityStore]
  );

  const togglePreviewField = useCallback((index: number) => {
    setState((s) => ({
      ...s,
      previewFields: s.previewFields.map((f, i) =>
        i === index ? { ...f, accepted: !f.accepted } : f
      ),
    }));
  }, []);

  const editPreviewField = useCallback((index: number, newValue: string) => {
    setState((s) => ({
      ...s,
      previewFields: s.previewFields.map((f, i) =>
        i === index ? { ...f, value: newValue } : f
      ),
    }));
  }, []);

  /** Apply previewed fills to the actual PDFs */
  const applyPreview = useCallback(
    async (files: StirlingFile[]) => {
      setState((s) => ({ ...s, phase: 'applying' }));
      try {
        // Group accepted preview fields by file
        const valuesByFile: Record<string, Record<string, string>> = {};
        for (const field of state.previewFields) {
          if (!field.accepted) continue;
          if (!valuesByFile[field.fileId]) valuesByFile[field.fileId] = {};
          valuesByFile[field.fileId][field.fieldName] = field.value;
        }

        for (const [fileId, values] of Object.entries(valuesByFile)) {
          const file = files.find((f) => f.fileId === fileId);
          if (!file || Object.keys(values).length === 0) continue;

          const filledBlob = await fillFormFields(file, values, false);
          window.dispatchEvent(
            new CustomEvent('formfill:apply', { detail: { blob: filledBlob, fileId } })
          );
        }

        const totalFilled = state.previewFields.filter((f) => f.accepted).length;
        setState({
          phase: 'done',
          results: state.results,
          previewFields: state.previewFields,
          message: `Applied ${totalFilled} fields across ${Object.keys(valuesByFile).length} files.`,
          error: null,
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          phase: 'error',
          error: err instanceof Error ? err.message : 'Failed to apply fills.',
        }));
      }
    },
    [state.previewFields, state.results]
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, fillAllFiles, togglePreviewField, editPreviewField, applyPreview, reset };
}
