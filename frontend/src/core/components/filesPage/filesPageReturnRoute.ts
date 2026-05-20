/**
 * Stores the route the user came from when they open files into the
 * workbench from My Files. Lets the workbench show a "Back to My Files"
 * affordance and return to the exact folder they were browsing.
 *
 * Persisted in sessionStorage so a hard reload keeps the return path
 * (matches user mental model - Cmd+R shouldn't lose the breadcrumb).
 */

const SESSION_KEY = "stirling.filesPage.returnRoute";
const SESSION_LABEL_KEY = "stirling.filesPage.returnLabel";

export interface FilesPageReturnRoute {
  route: string;
  label?: string;
}

/**
 * Cached snapshot so `useSyncExternalStore` returns a stable reference
 * across consecutive renders. The cache is invalidated whenever the
 * sessionStorage entry changes (via set/clear or storage event).
 */
let cachedSnapshot: FilesPageReturnRoute | null = null;
let cachedSerialised = "";

function readFromStorage(): FilesPageReturnRoute | null {
  try {
    const route = sessionStorage.getItem(SESSION_KEY);
    if (!route) return null;
    const label = sessionStorage.getItem(SESSION_LABEL_KEY) ?? undefined;
    return { route, label };
  } catch {
    return null;
  }
}

function refreshSnapshot(): void {
  const next = readFromStorage();
  const serialised = next ? `${next.route}|${next.label ?? ""}` : "";
  if (serialised !== cachedSerialised) {
    cachedSnapshot = next;
    cachedSerialised = serialised;
  }
}

export function setFilesPageReturnRoute(route: string, label?: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, route);
    if (label) sessionStorage.setItem(SESSION_LABEL_KEY, label);
    else sessionStorage.removeItem(SESSION_LABEL_KEY);
    refreshSnapshot();
    window.dispatchEvent(new CustomEvent("stirling-filespage-return-changed"));
  } catch {
    /* ignore */
  }
}

export function clearFilesPageReturnRoute(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_LABEL_KEY);
    refreshSnapshot();
    window.dispatchEvent(new CustomEvent("stirling-filespage-return-changed"));
  } catch {
    /* ignore */
  }
}

export function getFilesPageReturnRoute(): FilesPageReturnRoute | null {
  return cachedSnapshot;
}

/** Subscribe to changes (storage + same-tab CustomEvent). */
export function subscribeFilesPageReturnRoute(
  listener: () => void,
): () => void {
  const handler = () => {
    refreshSnapshot();
    listener();
  };
  window.addEventListener("storage", handler);
  window.addEventListener("stirling-filespage-return-changed", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("stirling-filespage-return-changed", handler);
  };
}

// Initial read on module load so the first useSyncExternalStore snapshot
// is correct even before any setters fire.
refreshSnapshot();
