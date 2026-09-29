import { useEffect, useState } from "react";

/**
 * A local "the user has grabbed the editor" flag for the getting-started
 * download step. The deployment endpoint is the authoritative signal, but it
 * only lights up once an instance reports in — so we also let the user's own
 * action (clicking a download button / pressing Done in the install modal) mark
 * the step complete immediately. Persisted so it survives reloads.
 */
const KEY = "stirling.portal.editorInstalled";
const EVENT = "stirling:editor-installed";

export function markEditorInstalled(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Private mode / storage disabled — the step just won't stick; harmless.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useEditorInstalled(): boolean {
  const [installed, setInstalled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const sync = () => {
      try {
        setInstalled(localStorage.getItem(KEY) === "1");
      } catch {
        // ignore
      }
    };
    // Same-tab mark fires EVENT; other tabs fire the native storage event.
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return installed;
}
