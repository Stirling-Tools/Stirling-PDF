import { useCallback, useRef, useState } from "react";

/**
 * The fetched bytes of the document the viewer shows. A replacement is held aside until its swap
 * lands, so export and access never describe a document that is not on screen; a failed swap
 * drops it and the outgoing source stays.
 */
export function useActiveUrlSource() {
  const [source, setSource] = useState<File | null>(null);
  const pending = useRef<{ key: string; source: File } | null>(null);

  const stage = useCallback((key: string, next: File, initial: boolean) => {
    if (initial) {
      pending.current = null;
      setSource(next);
    } else pending.current = { key, source: next };
  }, []);

  const settle = useCallback((key: string, landed: boolean) => {
    const staged = pending.current;
    if (staged?.key !== key) return;
    pending.current = null;
    if (landed) setSource(staged.source);
  }, []);

  return { source, stage, settle };
}
