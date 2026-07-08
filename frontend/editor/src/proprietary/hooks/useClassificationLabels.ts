/**
 * Loads and persists the team's classification labels
 * (`/api/v1/classification/labels`) — one server-truth set shared by the whole
 * team. When the team has none, this shows the built-in default as a starting
 * point for the editor/sidebar; note the classifier itself does NOT use that
 * default — the backend only classifies against a team's saved set (an unsaved
 * team is not classified). Editing is gated to team leaders / admins by the
 * backend — callers pass `canConfigure` (the policy gate) to keep read-only
 * users out of the save path.
 *
 * `teamLabels` is also what the sidebar/editor display uses — the team set, or
 * the built-in default when the team has none.
 */

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_CLASSIFICATION_LABELS,
  type ClassificationLabel,
} from "@app/data/classificationLabels";
import { fetchTeamLabels, saveTeamLabels } from "@app/services/labelsBackend";

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
