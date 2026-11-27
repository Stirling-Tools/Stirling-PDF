import { useState, useEffect, useCallback } from "react";
import { AutomationConfig } from "@editor/services/automationStorage";

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
        await import("@editor/services/automationStorage");
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
          await import("@editor/services/automationStorage");
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

  /** Saves a copy of a suggestion; expects the icon already as an iconMap key. */
  const copyFromSuggested = useCallback(
    async (
      suggestedAutomation: AutomationConfig,
    ): Promise<AutomationConfig> => {
      try {
        const { automationStorage } =
          await import("@editor/services/automationStorage");
        const saved = await automationStorage.saveAutomation({
          name: suggestedAutomation.name,
          description: suggestedAutomation.description,
          icon: suggestedAutomation.icon,
          operations: suggestedAutomation.operations,
        });
        refreshAutomations();
        return saved;
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
          await import("@editor/services/automationStorage");
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
