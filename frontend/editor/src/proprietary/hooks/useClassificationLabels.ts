/**
 * Loads and persists classification labels. Two server-truth scopes:
 *  - TEAM labels (`/api/v1/classification/labels`) — shared by the whole team;
 *    a team with none falls back to the built-in default. Editing is gated to
 *    team leaders / admins by the backend — callers pass `canConfigure` (the
 *    policy gate) to keep read-only users out of the save path.
 *  - MY labels (`…/labels/mine`) — the calling user's personal, additive set,
 *    editable by anyone and applied only to their own runs.
 *
 * `merged` is the effective vocabulary for the current user (team ∪ mine,
 * deduped case-insensitively, team first) — what the classifier will actually
 * pick from, and what the sidebar uses to resolve label icons.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CLASSIFICATION_LABELS,
  type ClassificationLabel,
} from "@app/data/classificationLabels";
import {
  fetchMyLabels,
  fetchTeamLabels,
  saveMyLabels,
  saveTeamLabels,
} from "@app/services/labelsBackend";

/** Team ∪ personal, deduped by name (case-insensitive), team entries first. */
export function mergeLabelSets(
  team: ClassificationLabel[],
  mine: ClassificationLabel[],
): ClassificationLabel[] {
  const seen = new Set<string>();
  const merged: ClassificationLabel[] = [];
  for (const label of [...team, ...mine]) {
    const key = label.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(label);
  }
  return merged;
}

export interface UseClassificationLabels {
  /** Server-truth team labels (or the built-in default when the team has none). */
  teamLabels: ClassificationLabel[];
  /** Whether the team has a stored set (vs. the built-in default). */
  isCustom: boolean;
  /** The calling user's personal additive labels. */
  myLabels: ClassificationLabel[];
  /** Effective vocabulary for this user: team ∪ mine. */
  merged: ClassificationLabel[];
  loading: boolean;
  saving: boolean;
  /** Last save failure, cleared on the next attempt. */
  error: string | null;
  /** Persist the team set; resolves once server state is updated. */
  saveTeam: (next: ClassificationLabel[]) => Promise<void>;
  /** Persist the personal set; resolves once server state is updated. */
  saveMine: (next: ClassificationLabel[]) => Promise<void>;
}

export function useClassificationLabels(
  enabled: boolean,
): UseClassificationLabels {
  const [teamLabels, setTeamLabels] = useState<ClassificationLabel[]>(
    DEFAULT_CLASSIFICATION_LABELS,
  );
  const [isCustom, setIsCustom] = useState(false);
  const [myLabels, setMyLabels] = useState<ClassificationLabel[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      // Personal labels are optional garnish — a failure there must not block
      // the team set (and vice versa), so the two are fetched independently.
      const [team, mine] = await Promise.all([
        fetchTeamLabels().catch(() => null),
        fetchMyLabels().catch(() => null),
      ]);
      if (cancelled) return;
      setTeamLabels(team ?? DEFAULT_CLASSIFICATION_LABELS);
      setIsCustom(team != null);
      setMyLabels(mine ?? []);
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

  const saveMine = useCallback(async (next: ClassificationLabel[]) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveMyLabels(next);
      setMyLabels(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your labels.");
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const merged = useMemo(
    () => mergeLabelSets(teamLabels, myLabels),
    [teamLabels, myLabels],
  );

  return {
    teamLabels,
    isCustom,
    myLabels,
    merged,
    loading,
    saving,
    error,
    saveTeam,
    saveMine,
  };
}
