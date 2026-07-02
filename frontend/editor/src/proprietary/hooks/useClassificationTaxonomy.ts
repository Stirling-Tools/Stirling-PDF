/**
 * Loads and persists the team's classification taxonomy. The backend
 * (`/api/v1/classification/taxonomy`) is the source of truth and is shared by
 * the whole team; a team with none falls back to the built-in default. Editing
 * is gated to team leaders / admins by the backend — the caller passes
 * `canConfigure` (the same policy gate) to keep read-only users out of the save
 * path.
 */

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_CLASSIFICATION_TAXONOMY,
  type ClassificationTaxonomy,
} from "@app/data/classificationTaxonomy";
import {
  fetchTeamTaxonomy,
  saveTeamTaxonomy,
} from "@app/services/taxonomyBackend";

export interface UseClassificationTaxonomy {
  /** Server-truth taxonomy (or the built-in default when the team has none). */
  taxonomy: ClassificationTaxonomy;
  /** Whether the team has a stored taxonomy (vs. the built-in default). */
  isCustom: boolean;
  loading: boolean;
  saving: boolean;
  /** Last save failure, cleared on the next attempt. */
  error: string | null;
  /** Persist a taxonomy for the team; resolves once server state is updated. */
  save: (next: ClassificationTaxonomy) => Promise<void>;
}

export function useClassificationTaxonomy(
  enabled: boolean,
): UseClassificationTaxonomy {
  const [taxonomy, setTaxonomy] = useState<ClassificationTaxonomy>(
    DEFAULT_CLASSIFICATION_TAXONOMY,
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
      try {
        const stored = await fetchTeamTaxonomy();
        if (cancelled) return;
        setTaxonomy(stored ?? DEFAULT_CLASSIFICATION_TAXONOMY);
        setIsCustom(stored != null);
      } catch {
        // Backend down / not permitted — fall back to the default (read-only).
        if (!cancelled) {
          setTaxonomy(DEFAULT_CLASSIFICATION_TAXONOMY);
          setIsCustom(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const save = useCallback(async (next: ClassificationTaxonomy) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveTeamTaxonomy(next);
      setTaxonomy(saved);
      setIsCustom(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the taxonomy.");
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { taxonomy, isCustom, loading, saving, error, save };
}
