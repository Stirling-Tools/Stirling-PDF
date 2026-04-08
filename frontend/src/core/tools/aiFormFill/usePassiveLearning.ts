/**
 * Passive learning — detects manual edits after AI fill and offers to save them back to entities.
 * Compares AI-filled values against current form values to find user changes.
 */
import { useState, useCallback } from 'react';
import { useFormFill } from '@app/tools/formFill/FormFillContext';
import type { EntityStore } from './useEntityStore';
import type { PreviewField } from './useBatchFormFillFlow';

export interface LearnedField {
  fieldName: string;
  originalValue: string;
  newValue: string;
  suggestedEntityId: string | null;
  suggestedEntityName: string | null;
  accepted: boolean;
}

export interface PassiveLearning {
  learnedFields: LearnedField[];
  detectChanges: (appliedFields: PreviewField[], entityStore: EntityStore) => void;
  toggleField: (index: number) => void;
  setEntityForField: (index: number, entityId: string) => void;
  commitLearned: (entityStore: EntityStore) => void;
  reset: () => void;
  hasChanges: boolean;
}

export function usePassiveLearning(): PassiveLearning {
  const [learnedFields, setLearnedFields] = useState<LearnedField[]>([]);
  const formFill = useFormFill();

  const detectChanges = useCallback(
    (appliedFields: PreviewField[], entityStore: EntityStore) => {
      const changes: LearnedField[] = [];

      for (const field of appliedFields) {
        if (!field.accepted) continue;
        const currentValue = formFill.getValue(field.fieldName);
        if (currentValue && currentValue !== field.value) {
          // User changed this field after AI fill
          const sourceEntity = entityStore.entities.find((e) => e.name === field.entityName);
          changes.push({
            fieldName: field.fieldName,
            originalValue: field.value,
            newValue: currentValue,
            suggestedEntityId: sourceEntity?.id || null,
            suggestedEntityName: sourceEntity?.name || null,
            accepted: true,
          });
        }
      }

      // Also check for new values in fields that were NOT filled by AI
      // (user typed into a blank field)
      for (const formField of formFill.state.fields) {
        const wasAiFilled = appliedFields.some((f) => f.fieldName === formField.name && f.accepted);
        if (wasAiFilled) continue;

        const currentValue = formFill.getValue(formField.name);
        if (currentValue && currentValue !== formField.value) {
          changes.push({
            fieldName: formField.name,
            originalValue: '',
            newValue: currentValue,
            suggestedEntityId: entityStore.defaultEntityId,
            suggestedEntityName: entityStore.defaultEntityId
              ? entityStore.getEntity(entityStore.defaultEntityId)?.name || null
              : null,
            accepted: true,
          });
        }
      }

      setLearnedFields(changes);
    },
    [formFill]
  );

  const toggleField = useCallback((index: number) => {
    setLearnedFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, accepted: !f.accepted } : f))
    );
  }, []);

  const setEntityForField = useCallback((index: number, entityId: string) => {
    setLearnedFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, suggestedEntityId: entityId } : f))
    );
  }, []);

  const commitLearned = useCallback(
    (entityStore: EntityStore) => {
      for (const field of learnedFields) {
        if (!field.accepted || !field.suggestedEntityId) continue;
        // Use the field name as the knowledge key (normalize it)
        const key = field.fieldName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        entityStore.setField(field.suggestedEntityId, key, field.newValue);
      }
      setLearnedFields([]);
    },
    [learnedFields]
  );

  const reset = useCallback(() => setLearnedFields([]), []);

  return {
    learnedFields,
    detectChanges,
    toggleField,
    setEntityForField,
    commitLearned,
    reset,
    hasChanges: learnedFields.length > 0,
  };
}
