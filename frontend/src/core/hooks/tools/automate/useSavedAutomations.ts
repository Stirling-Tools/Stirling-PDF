import { useState, useEffect, useCallback } from 'react';
import { AutomationConfig } from '@app/services/automationStorage';
import { SuggestedAutomation } from '@app/types/automation';

export interface SavedAutomation extends AutomationConfig {}

export function useSavedAutomations() {
  const [savedAutomations, setSavedAutomations] = useState<SavedAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadSavedAutomations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { automationStorage } = await import('@app/services/automationStorage');
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
      const { automationStorage } = await import('@app/services/automationStorage');
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
      const { automationStorage } = await import('@app/services/automationStorage');

      // Map suggested automation icons to MUI icon keys
      const getIconKey = (_suggestedIcon: {id: string}): string => {
        // Check the automation ID or name to determine the appropriate icon
        switch (suggestedAutomation.id) {
          case 'secure-pdf-ingestion':
          case 'secure-workflow':
            return 'SecurityIcon'; // Security icon for security workflows
          case 'email-preparation':
            return 'CompressIcon'; // Compression icon
          case 'process-images':
            return 'StarIcon'; // Star icon for process images
          default:
            return 'SettingsIcon'; // Default fallback
        }
      };

      // Convert suggested automation to saved automation format
      const savedAutomation = {
        name: suggestedAutomation.name,
        description: suggestedAutomation.description,
        icon: getIconKey(suggestedAutomation.icon),
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
