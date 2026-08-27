import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useGroupSigningEnabled } from "@app/hooks/useGroupSigningEnabled";
import { getDisabledLabel } from "@app/components/tools/fullscreen/shared";

/** Mirrors the same tools' `endpoints` in the tool registry. */
const ENTRY_ENDPOINTS: Record<string, string[]> = {
  automate: ["automate"],
};

/**
 * The two the tool picker tells apart, plus shared signing - a whole feature the
 * server can switch off rather than a route it can remove.
 */
type EndpointCause = "missingDependency" | "disabledByAdmin";
type Cause = EndpointCause | "groupSigningOff";
const CAUSES: Cause[] = [
  "missingDependency",
  "disabledByAdmin",
  "groupSigningOff",
];

/**
 * Remembered so a reload starts from the last answer, not from "everything works".
 * Causes rather than sentences, so a language change can't resurrect stale text.
 */
const STORAGE_KEY = "stirling.quickNav.toolCauses";

function readRemembered(): Record<string, Cause> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const known = Object.entries(parsed as Record<string, unknown>).filter(
      ([, cause]) => CAUSES.includes(cause as Cause),
    ) as [string, Cause][];
    return Object.fromEntries(known);
  } catch {
    // Private mode, or nonsense in storage: same as a first visit.
    return null;
  }
}

function remember(causes: Record<string, Cause>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(causes));
  } catch {
    // Won't survive the next reload.
  }
}

function causesFor(
  endpointStatus: Record<string, boolean>,
  endpointDetails: Record<string, { reason?: string | null }>,
): Record<string, Cause> {
  const causes: Record<string, Cause> = {};
  for (const [entry, needed] of Object.entries(ENTRY_ENDPOINTS)) {
    const off = needed.filter((name) => endpointStatus[name] === false);
    if (off.length === 0) continue;
    causes[entry] = off.some(
      (name) => endpointDetails[name]?.reason === "DEPENDENCY",
    )
      ? "missingDependency"
      : "disabledByAdmin";
  }
  return causes;
}

/**
 * Why a rail entry can't be used - translated, keyed by entry id, absent when
 * usable. Null means no answer yet, which is not the same as an empty map ("asked,
 * nothing wrong").
 *
 * Read here rather than handed down, so the editor and the processor can't
 * disagree about the same entry. Only the signals both apps can see; the editor
 * layers its own on top.
 *
 * The last answer is held through a re-fetch - each app has its own query cache
 * and a reload has none - so the bar changes only when the answer does.
 */
export function useQuickNavToolReasons(): Record<string, string> | null {
  const { t } = useTranslation();
  const endpoints = useMemo(() => Object.values(ENTRY_ENDPOINTS).flat(), []);
  const { endpointStatus, endpointDetails, loading } =
    useMultipleEndpointsEnabled(endpoints);

  // Once, at mount: later reads would fight the live answer.
  const [remembered] = useState(readRemembered);

  // Its own signal, and its config loads separately from the endpoint list.
  const { loading: configLoading } = useAppConfig();
  const groupSigningEnabled = useGroupSigningEnabled();

  const live = useMemo(() => {
    // A half answer would light up whatever it can't see yet.
    if (loading || configLoading) return null;
    const causes = causesFor(endpointStatus, endpointDetails);
    if (!groupSigningEnabled) causes.sharedSign = "groupSigningOff";
    return causes;
  }, [
    loading,
    configLoading,
    endpointStatus,
    endpointDetails,
    groupSigningEnabled,
  ]);

  // Keyed on contents: the object is rebuilt every render.
  const liveKey = live ? JSON.stringify(live) : null;
  useEffect(() => {
    if (liveKey) remember(JSON.parse(liveKey) as Record<string, Cause>);
  }, [liveKey]);

  const causes = live ?? remembered;

  return useMemo(() => {
    if (!causes) return null;
    const reasons: Record<string, string> = {};
    for (const [entry, cause] of Object.entries(causes)) {
      if (cause === "groupSigningOff") {
        // The tool's own wording. Stop removed: the reason is appended to a label,
        // not written as a sentence.
        reasons[entry] = t(
          "sharedSign.disabledBody",
          "Collaborative signing isn't enabled on this server.",
        ).replace(/\.\s*$/, "");
        continue;
      }
      // Colon removed: these labels are written to sit in front of a tool name.
      const { key, fallback } = getDisabledLabel(cause);
      reasons[entry] = t(key, fallback).replace(/:\s*$/, "");
    }
    return reasons;
  }, [causes, t]);
}
