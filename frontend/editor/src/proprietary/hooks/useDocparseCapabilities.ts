import { useEffect, useState } from "react";
import apiClient from "@app/services/apiClient";

/** The merged capability view served by GET /api/v1/docparse/capabilities. */
export interface DocparseCapabilities {
  enabled: boolean;
  mode: string;
  advancedInstalled: boolean;
  engineReachable: boolean;
  doclingVersion: string | null;
}

// Module-level cache so every intro card shares one fetch per page load,
// mirroring the useEndpointConfig global-cache pattern.
let cachedCapabilities: DocparseCapabilities | null = null;
let inFlight: Promise<DocparseCapabilities | null> | null = null;

async function fetchCapabilities(): Promise<DocparseCapabilities | null> {
  try {
    const response = await apiClient.get<DocparseCapabilities>(
      "/api/v1/docparse/capabilities",
      { suppressErrorToast: true, skipAuthRedirect: true },
    );
    cachedCapabilities = response.data;
    return cachedCapabilities;
  } catch {
    return null;
  } finally {
    inFlight = null;
  }
}

/** Test seam: forget the cached capabilities so the next mount refetches. */
export function resetDocparseCapabilitiesCache() {
  cachedCapabilities = null;
  inFlight = null;
}

/**
 * The DocParse capability report (tier, engine reachability), module-cached so
 * the intro card on every docparse tool costs at most one request.
 */
export function useDocparseCapabilities(): {
  capabilities: DocparseCapabilities | null;
  loading: boolean;
} {
  const [capabilities, setCapabilities] = useState<DocparseCapabilities | null>(
    cachedCapabilities,
  );
  const [loading, setLoading] = useState(cachedCapabilities === null);

  useEffect(() => {
    if (cachedCapabilities) {
      setCapabilities(cachedCapabilities);
      setLoading(false);
      return;
    }
    let cancelled = false;
    inFlight = inFlight ?? fetchCapabilities();
    inFlight.then((result) => {
      if (cancelled) return;
      setCapabilities(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { capabilities, loading };
}
