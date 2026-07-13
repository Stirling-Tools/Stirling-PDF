// Loads/persists the team's classification labels through the portal transport,
// falling back to the built-in default when the team has none. Portal counterpart
// of the editor's `proprietary/hooks/useClassificationLabels`.

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_CLASSIFICATION_LABELS,
  type ClassificationLabel,
} from "@app/data/classificationLabels";
import {
  fetchTeamLabels,
  saveTeamLabels,
} from "@portal/api/classificationLabels";

export interface UseClassificationLabels {
  /** Server-truth team labels (or the built-in default when the team has none). */
  teamLabels: ClassificationLabel[];
  /** Whether the team has a stored set (vs. the built-in default). */
  isCustom: boolean;
  loading: boolean;
  saving: boolean;
  /** Last save failure, cleared on the next attempt. */
  error: string | null;
  /** Persist the team set; resolves once server state is updated. */
  saveTeam: (next: ClassificationLabel[]) => Promise<void>;
}

export function useClassificationLabels(
  enabled: boolean,
): UseClassificationLabels {
  const [teamLabels, setTeamLabels] = useState<ClassificationLabel[]>(
    DEFAULT_CLASSIFICATION_LABELS,
  );
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const team = await fetchTeamLabels().catch(() => null);
      if (cancelled) return;
      setTeamLabels(team ?? DEFAULT_CLASSIFICATION_LABELS);
      setIsCustom(team != null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const saveTeam = useCallback(async (next: ClassificationLabel[]) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveTeamLabels(next);
      setTeamLabels(saved);
      setIsCustom(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the labels.");
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    teamLabels,
    isCustom,
    loading,
    saving,
    error,
    saveTeam,
  };
}
