import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useGroupSigningEnabled } from "@app/hooks/useGroupSigningEnabled";
import { getDisabledLabel } from "@app/components/tools/fullscreen/shared";
import type { QuickNavToolReasons } from "@app/contexts/QuickNavHostContext";
import type { ToolId } from "@app/types/toolId";

const ENTRY_ENDPOINTS = {
  automate: ["automate"],
} satisfies Partial<Record<ToolId, string[]>>;

// Object.keys widens to string, which a tool-id-keyed record can't be indexed by.
const ENDPOINT_ENTRIES = Object.keys(
  ENTRY_ENDPOINTS,
) as (keyof typeof ENTRY_ENDPOINTS)[];

/** Shared signing is a feature toggle rather than an endpoint, so it has its own cause. */
type EndpointCause = "missingDependency" | "disabledByAdmin";
type Cause = EndpointCause | "groupSigningOff";
type Causes = Partial<Record<ToolId, Cause>>;
const CAUSES: Cause[] = [
  "missingDependency",
  "disabledByAdmin",
  "groupSigningOff",
];

/** Causes, not sentences, so a language change can't resurrect stale text. */
const STORAGE_KEY = "stirling.quickNav.toolCauses";

function readRemembered(): Causes | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const known = Object.entries(parsed as Record<string, unknown>).filter(
      ([, cause]) => CAUSES.includes(cause as Cause),
    ) as [ToolId, Cause][];
    return Object.fromEntries(known);
  } catch {
    return null;
  }
}

function remember(causes: Causes): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(causes));
  } catch {
    // Won't survive the next reload.
  }
}

function causesFor(
  endpointStatus: Record<string, boolean>,
  endpointDetails: Record<string, { reason?: string | null }>,
): Causes {
  const causes: Causes = {};
  for (const entry of ENDPOINT_ENTRIES) {
    const off = ENTRY_ENDPOINTS[entry].filter(
      (name) => endpointStatus[name] === false,
    );
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
 * Why a rail entry can't be used. Null means no answer yet; an empty map means nothing
 * is wrong. The last answer is held through a re-fetch.
 */
export function useQuickNavToolReasons(): QuickNavToolReasons | null {
  const { t } = useTranslation();
  const endpoints = useMemo(() => Object.values(ENTRY_ENDPOINTS).flat(), []);
  const { endpointStatus, endpointDetails, loading } =
    useMultipleEndpointsEnabled(endpoints);

  // Once: later reads would fight the live answer.
  const [remembered] = useState(readRemembered);

  const { loading: configLoading } = useAppConfig();
  const groupSigningEnabled = useGroupSigningEnabled();

  const live = useMemo(() => {
    // A half answer would dim entries it can't see yet.
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
    if (liveKey) remember(JSON.parse(liveKey) as Causes);
  }, [liveKey]);

  const causes = live ?? remembered;

  return useMemo(() => {
    if (!causes) return null;
    const reasons: QuickNavToolReasons = {};
    for (const entry of Object.keys(causes) as ToolId[]) {
      const cause = causes[entry];
      if (cause === "groupSigningOff") {
        // The tool's own wording, minus the full stop.
        reasons[entry] = t(
          "sharedSign.disabledBody",
          "Collaborative signing isn't enabled on this server.",
        ).replace(/\.\s*$/, "");
        continue;
      }
      if (!cause) continue;
      // These labels normally sit in front of a tool name, hence the trailing colon.
      const { key, fallback } = getDisabledLabel(cause);
      reasons[entry] = t(key, fallback).replace(/:\s*$/, "");
    }
    return reasons;
  }, [causes, t]);
}
