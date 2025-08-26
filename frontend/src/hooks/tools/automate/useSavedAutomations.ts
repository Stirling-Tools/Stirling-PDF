import { useState, useEffect, useCallback } from 'react';
import { AutomationConfig } from '../../../services/automationStorage';
import { SuggestedAutomation } from '../../../types/automation';

export interface SavedAutomation extends AutomationConfig {}

export function useSavedAutomations() {
  const [savedAutomations, setSavedAutomations] = useState<SavedAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadSavedAutomations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { automationStorage } = await import('../../../services/automationStorage');
      const automations = await automationStorage.getAllAutomations();
      setSavedAutomations(automations);
    } catch (err) {
      console.error('Error loading saved automations:', err);
      setError(err as Error);
      setSavedAutomations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAutomations = useCallback(() => {
    loadSavedAutomations();
  }, [loadSavedAutomations]);

  const deleteAutomation = useCallback(async (id: string) => {
    try {
      const { automationStorage } = await import('../../../services/automationStorage');
      await automationStorage.deleteAutomation(id);
      // Refresh the list after deletion
      refreshAutomations();
    } catch (err) {
      console.error('Error deleting automation:', err);
      throw err;
    }
  }, [refreshAutomations]);

  const copyFromSuggested = useCallback(async (suggestedAutomation: SuggestedAutomation) => {
    try {
      const { automationStorage } = await import('../../../services/automationStorage');
      
      // Convert suggested automation to saved automation format
      const savedAutomation = {
        name: suggestedAutomation.name,
        description: suggestedAutomation.description,
        operations: suggestedAutomation.operations
      };
      
      await automationStorage.saveAutomation(savedAutomation);
      // Refresh the list after saving
      refreshAutomations();
    } catch (err) {
      console.error('Error copying suggested automation:', err);
      throw err;
    }
  }, [refreshAutomations]);

  // Load automations on mount
  useEffect(() => {
    loadSavedAutomations();
  }, [loadSavedAutomations]);

  return {
    savedAutomations,
    loading,
    error,
    refreshAutomations,
    deleteAutomation,
    copyFromSuggested
  };
}