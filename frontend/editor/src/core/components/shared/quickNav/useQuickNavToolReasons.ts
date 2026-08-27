import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";
import { getDisabledLabel } from "@app/components/tools/fullscreen/shared";

/**
 * Which server endpoints each rail entry needs, mirroring the same tools' own
 * `endpoints` in the tool registry.
 */
const ENTRY_ENDPOINTS: Record<string, string[]> = {
  automate: ["automate"],
};

/** The two causes the tool picker tells apart, and this follows. */
type Cause = "missingDependency" | "disabledByAdmin";

/**
 * Remembered per browser, so a reload starts from the last answer rather than from
 * "everything works". Causes rather than finished sentences, so switching language
 * cannot resurrect text in the previous one.
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
      ([, cause]) =>
        cause === "missingDependency" || cause === "disabledByAdmin",
    ) as [string, Cause][];
    return Object.fromEntries(known);
  } catch {
    // Private mode, or something else left nonsense here. Knowing nothing is what
    // a first visit sees anyway.
    return null;
  }
}

function remember(causes: Record<string, Cause>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(causes));
  } catch {
    // The answer just will not survive the next reload.
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
 * Why a rail entry can't be used, from the endpoint availability the server
 * reports - already translated, keyed by rail entry id, absent when usable. Null
 * only in a browser that has never had an answer, which is different from an empty
 * map: the first means "no idea", the second "asked, and nothing is wrong".
 *
 * Read here rather than taken from the app around it so that both apps get the
 * same answer. The editor knows its tools are disabled through its own workbench
 * state, which the processor has none of; before this, the same Automate icon was
 * greyed out with an explanation on one side of the app switch and looked
 * perfectly usable on the other.
 *
 * The answer is held onto twice over, because the bar must not change what it says
 * while it is merely being re-fetched - only when the answer itself changes. Each
 * app has its own query cache, so switching between them starts with nothing
 * cached; a reload starts with nothing at all. In both cases this reports what it
 * last knew instead of "nothing is wrong", which is what made a dimmed entry flash
 * back to usable and dim again a moment later.
 *
 * Deliberately only the endpoint signal. The richer picture the editor has - a tool
 * with no implementation yet, one behind a paywall, a desktop build whose server is
 * offline - is published on top of this by the app that can see it, and none of it
 * applies to the entries here.
 */
export function useQuickNavToolReasons(): Record<string, string> | null {
  const { t } = useTranslation();
  const endpoints = useMemo(() => Object.values(ENTRY_ENDPOINTS).flat(), []);
  const { endpointStatus, endpointDetails, loading } =
    useMultipleEndpointsEnabled(endpoints);

  // Read once, at mount: reading again later would fight the live answer.
  const [remembered] = useState(readRemembered);

  const live = useMemo(
    () => (loading ? null : causesFor(endpointStatus, endpointDetails)),
    [loading, endpointStatus, endpointDetails],
  );

  // Keyed on contents, not on the object, which is rebuilt every render.
  const liveKey = live ? JSON.stringify(live) : null;
  useEffect(() => {
    if (liveKey) remember(JSON.parse(liveKey) as Record<string, Cause>);
  }, [liveKey]);

  const causes = live ?? remembered;

  return useMemo(() => {
    if (!causes) return null;
    const reasons: Record<string, string> = {};
    for (const [entry, cause] of Object.entries(causes)) {
      const { key, fallback } = getDisabledLabel(cause);
      // The shared labels are written to sit in front of a tool name; the rail
      // appends them after the entry's own label instead.
      reasons[entry] = t(key, fallback).replace(/:\s*$/, "");
    }
    return reasons;
  }, [causes, t]);
}
