import { useState, useEffect, useCallback } from "react";
import { AutomationConfig } from "@app/services/automationStorage";
import { SuggestedAutomation } from "@app/types/automation";
import { iconKeyForSuggestedAutomation } from "@app/components/tools/automate/suggestedAutomationIcon";

export interface SavedAutomation extends AutomationConfig {}

export type ImportableAutomation = Omit<
  AutomationConfig,
  "id" | "createdAt" | "updatedAt"
>;

export function useSavedAutomations() {
  const [savedAutomations, setSavedAutomations] = useState<SavedAutomation[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadSavedAutomations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { automationStorage } =
        await import("@app/services/automationStorage");
      const automations = await automationStorage.getAllAutomations();
      setSavedAutomations(automations);
    } catch (err) {
      console.error("Error loading saved automations:", err);
      setError(err as Error);
      setSavedAutomations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAutomations = useCallback(() => {
    loadSavedAutomations();
  }, [loadSavedAutomations]);

  const deleteAutomation = useCallback(
    async (id: string) => {
      try {
        const { automationStorage } =
          await import("@app/services/automationStorage");
        await automationStorage.deleteAutomation(id);
        // Refresh the list after deletion
        refreshAutomations();
      } catch (err) {
        console.error("Error deleting automation:", err);
        throw err;
      }
    },
    [refreshAutomations],
  );

  const copyFromSuggested = useCallback(
    async (suggestedAutomation: SuggestedAutomation) => {
      try {
        const { automationStorage } =
          await import("@app/services/automationStorage");

        // Convert suggested automation to saved automation format
        const savedAutomation = {
          name: suggestedAutomation.name,
          description: suggestedAutomation.description,
          icon: iconKeyForSuggestedAutomation(suggestedAutomation.id),
          operations: suggestedAutomation.operations,
        };

        await automationStorage.saveAutomation(savedAutomation);
        // Refresh the list after saving
        refreshAutomations();
      } catch (err) {
        console.error("Error copying suggested automation:", err);
        throw err;
      }
    },
    [refreshAutomations],
  );

  const importAutomation = useCallback(
    async (automation: ImportableAutomation): Promise<SavedAutomation> => {
      try {
        const { automationStorage } =
          await import("@app/services/automationStorage");
        const saved = await automationStorage.saveAutomation(automation);
        refreshAutomations();
        return saved;
      } catch (err) {
        console.error("Error importing automation:", err);
        throw err;
      }
    },
    [refreshAutomations],
  );

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
    copyFromSuggested,
    importAutomation,
  };
}
