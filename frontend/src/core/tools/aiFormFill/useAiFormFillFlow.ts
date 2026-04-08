/**
 * AI Form Fill flow hook.
 * Thin layer on top of FormFillContext — sends fields to AI engine,
 * writes fills back via setValue(). Handles role detection and confirmation.
 */
import { useState, useCallback, useMemo } from 'react';
import { useFormFill } from '@app/tools/formFill/FormFillContext';
import { aiFormFill } from './aiFormFillApi';
import { extractPageTexts } from './pdfTextExtraction';
import type {
  AiFormFillResponse,
  CleanedLabel,
  FieldMapping,
  FormField,
  RoleConfirmationResponse,
  RoleDetectionResult,
} from './types';

type SingleFilePhase = 'setup' | 'filling' | 'role_confirm' | 'results';
import type { KnowledgeStore } from './useKnowledgeStore';

export interface AiFormFillFlowState {
  phase: SingleFilePhase;
  filledFields: FieldMapping[];
  cleanedLabels: CleanedLabel[];
  skippedFieldNames: string[];
  roleDetection: RoleDetectionResult | null;
  pendingConfirmation: RoleConfirmationResponse | null;
  aiMessage: string | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: AiFormFillFlowState = {
  phase: 'setup',
  filledFields: [],
  cleanedLabels: [],
  skippedFieldNames: [],
  roleDetection: null,
  pendingConfirmation: null,
  aiMessage: null,
  loading: false,
  error: null,
};

function buildFieldsForAi(
  fields: FormField[],
  pageTexts: Record<number, string>
): FormField[] {
  return fields.map((f) => {
    const pageIndex = f.widgets?.[0]?.pageIndex;
    const nearbyText = pageIndex != null ? pageTexts[pageIndex] : undefined;
    return {
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
      nearbyPageText: nearbyText,
    } as unknown as FormField;
  });
}

export function useAiFormFillFlow(knowledge: KnowledgeStore) {
  const [state, setState] = useState<AiFormFillFlowState>(INITIAL_STATE);
  const formFill = useFormFill();

  const labelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cl of state.cleanedLabels) {
      map[cl.fieldName] = cl.label;
    }
    return map;
  }, [state.cleanedLabels]);

  const applyFills = useCallback(
    (fills: FieldMapping[]) => {
      for (const fill of fills) {
        formFill.setValue(fill.fieldName, fill.value);
      }
    },
    [formFill]
  );

  const startAutoFill = useCallback(
    async (file: File | Blob, roleOverride?: string) => {
      setState((s) => ({ ...s, phase: 'filling', loading: true, error: null, pendingConfirmation: null }));
      try {
        const fields = formFill.state.fields;
        if (fields.length === 0) {
          setState((s) => ({
            ...s,
            phase: 'setup',
            loading: false,
            error: 'No fillable form fields found.',
          }));
          return;
        }

        let pageTexts: Record<number, string> = {};
        try {
          pageTexts = await extractPageTexts(file);
        } catch {
          // Non-critical
        }

        const fieldsForAi = buildFieldsForAi(fields, pageTexts);

        const response: AiFormFillResponse = await aiFormFill({
          userMessage: 'Fill this form with my known information.',
          conversationHistory: [],
          formFields: fieldsForAi,
          knowledge: knowledge.entries,
          roleOverride: roleOverride || undefined,
        });

        console.log('[AI Form Fill] Response:', JSON.stringify(response, null, 2));

        if (response.outcome === 'fill_result') {
          applyFills(response.filledFields);
          setState((s) => ({
            ...s,
            phase: 'results',
            loading: false,
            filledFields: response.filledFields,
            cleanedLabels: response.cleanedLabels || [],
            skippedFieldNames: response.skippedFieldNames || [],
            roleDetection: response.roleDetection || null,
            aiMessage: response.message,
          }));
        } else if (response.outcome === 'role_confirmation_needed') {
          setState((s) => ({
            ...s,
            phase: 'role_confirm',
            loading: false,
            pendingConfirmation: response,
            cleanedLabels: response.cleanedLabels || [],
            skippedFieldNames: response.skippedFieldNames || [],
            roleDetection: response.roleDetection,
            aiMessage: response.question,
          }));
        } else if (response.outcome === 'form_fill_clarification') {
          setState((s) => ({
            ...s,
            phase: 'setup',
            loading: false,
            error: response.question,
          }));
        } else {
          setState((s) => ({
            ...s,
            phase: 'setup',
            loading: false,
            error: 'Unexpected response from AI engine.',
          }));
        }
      } catch (err) {
        setState((s) => ({
          ...s,
          phase: 'setup',
          loading: false,
          error: err instanceof Error ? err.message : 'AI form filling failed.',
        }));
      }
    },
    [knowledge.entries, formFill, applyFills]
  );

  /** User confirms the AI's suggested role — apply provisional fills, no second call */
  const confirmRole = useCallback(
    (remember: boolean) => {
      const pending = state.pendingConfirmation;
      if (!pending) return;

      applyFills(pending.provisionalFills);

      if (remember && pending.suggestedPrimary) {
        const current = knowledge.entries['_role_preference'] || '';
        const keywords = current ? current.split(',').map((k) => k.trim().toLowerCase()) : [];
        const newKeyword = pending.suggestedPrimary.toLowerCase();
        if (!keywords.includes(newKeyword)) {
          keywords.push(newKeyword);
          knowledge.set('_role_preference', keywords.join(','));
        }
      }

      setState((s) => ({
        ...s,
        phase: 'results',
        filledFields: pending.provisionalFills,
        pendingConfirmation: null,
        aiMessage: `Filled as "${pending.suggestedPrimary}".`,
      }));
    },
    [state.pendingConfirmation, applyFills, knowledge]
  );

  /** User picks a different role — re-run with override */
  const selectRole = useCallback(
    async (roleLabel: string, file: File | Blob, remember: boolean) => {
      if (remember) {
        const current = knowledge.entries['_role_preference'] || '';
        const keywords = current ? current.split(',').map((k) => k.trim().toLowerCase()) : [];
        const newKeyword = roleLabel.toLowerCase();
        if (!keywords.includes(newKeyword)) {
          keywords.push(newKeyword);
          knowledge.set('_role_preference', keywords.join(','));
        }
      }
      await startAutoFill(file, roleLabel);
    },
    [knowledge, startAutoFill]
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    labelMap,
    formFill,
    startAutoFill,
    confirmRole,
    selectRole,
    reset,
  };
}
