/**
 * Hook for the Form Analysis phase.
 * Fetches fields for all files, extracts page text, sends to AI analyser,
 * stores analysis result with role-grouped data.
 */
import { useState, useCallback } from 'react';
import { fetchFormFieldsWithCoordinates } from '@app/tools/formFill/formApi';
import { extractPageTexts } from './pdfTextExtraction';
import { analyseMultipleForms } from './aiFormFillApi';
import type {
  FormAnalysisResponse,
  FormField,
  CrossFileRole,
} from './types';
import type { FormField as FullFormField } from '@app/tools/formFill/types';
import type { KnowledgeStore } from './useKnowledgeStore';

export type AnalysisPhase = 'idle' | 'fetching_fields' | 'analysing' | 'done' | 'error';

export interface FormAnalysisState {
  phase: AnalysisPhase;
  /** Raw fields fetched from Java backend, keyed by fileId */
  fieldsByFile: Record<string, FullFormField[]>;
  /** AI analysis result */
  analysis: FormAnalysisResponse | null;
  /** Role → profile name assignment (user picks these) */
  roleProfileMap: Record<string, string>;
  /** Per-file role overrides: fileId → roleLabel → profileName */
  fileRoleOverrides: Record<string, Record<string, string>>;
  error: string | null;
}

const INITIAL_STATE: FormAnalysisState = {
  phase: 'idle',
  fieldsByFile: {},
  analysis: null,
  roleProfileMap: {},
  fileRoleOverrides: {},
  error: null,
};

interface StirlingFile extends File {
  readonly fileId: string;
}

function buildFieldForAi(field: FullFormField, pageTexts: Record<number, string>): FormField {
  const pageIndex = field.widgets?.[0]?.pageIndex;
  const nearbyText = pageIndex != null ? pageTexts[pageIndex] : undefined;
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    value: field.value,
    options: field.options,
    displayOptions: field.displayOptions,
    required: field.required,
    readOnly: field.readOnly,
    multiSelect: field.multiSelect,
    multiline: field.multiline,
    tooltip: field.tooltip,
    nearbyPageText: nearbyText,
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
          const fields = await fetchFormFieldsWithCoordinates(sf);
          fieldsByFile[sf.fileId] = fields;
        })
      );

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

      // Step 3: Build analysis request
      const request = {
        files: files.map((sf) => ({
          fileId: sf.fileId,
          fileName: sf.name,
          formFields: (fieldsByFile[sf.fileId] || []).map((f) =>
            buildFieldForAi(f, pageTextsByFile[sf.fileId] || {})
          ),
        })),
      };

      // Step 4: Call analyser (one call for all files)
      const analysis = await analyseMultipleForms(request);
      console.log('[Form Analysis] Response:', JSON.stringify(analysis, null, 2));

      // Step 5: Auto-assign primary roles to the active profile
      const initialRoleMap: Record<string, string> = {};
      for (const role of analysis.crossFileRoles) {
        if (role.isPrimaryPerson) {
          initialRoleMap[role.roleLabel] = knowledge.activeProfileName;
        }
      }

      setState((s) => ({
        ...s,
        phase: 'done',
        analysis,
        roleProfileMap: initialRoleMap,
        fileRoleOverrides: {},
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: 'error',
        error: err instanceof Error ? err.message : 'Form analysis failed.',
      }));
    }
  }, [knowledge.activeProfileName]);

  const setRoleProfile = useCallback((roleLabel: string, profileName: string) => {
    setState((s) => ({
      ...s,
      roleProfileMap: { ...s.roleProfileMap, [roleLabel]: profileName },
    }));
  }, []);

  const setFileRoleOverride = useCallback(
    (fileId: string, roleLabel: string, profileName: string) => {
      setState((s) => ({
        ...s,
        fileRoleOverrides: {
          ...s.fileRoleOverrides,
          [fileId]: { ...(s.fileRoleOverrides[fileId] || {}), [roleLabel]: profileName },
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

  const getEffectiveProfile = useCallback(
    (fileId: string, roleLabel: string): string | undefined => {
      return state.fileRoleOverrides[fileId]?.[roleLabel] || state.roleProfileMap[roleLabel];
    },
    [state.fileRoleOverrides, state.roleProfileMap]
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    analyseAllFiles,
    setRoleProfile,
    setFileRoleOverride,
    clearFileRoleOverride,
    getEffectiveProfile,
    reset,
  };
}
