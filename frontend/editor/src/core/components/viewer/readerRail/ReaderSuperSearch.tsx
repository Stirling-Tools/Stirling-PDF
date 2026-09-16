import { useCallback, useEffect, useRef, useState } from "react";

import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import { useEditorSearchScopes } from "@app/hooks/useSuperSearch";
import "@app/components/viewer/readerRail/ReaderSuperSearch.css";

/**
 * Super search over the document being read. The workbench bar that normally
 * carries it is not on screen here, and leaving reading to reach it is the jump
 * this surface exists to avoid, so Ctrl+K floats it over the page instead.
 *
 * Mounted only while open: the search binds Ctrl+K itself, so a hidden instance
 * would race this one for the shortcut and focus a box nobody can see.
 */
export function ReaderSuperSearch() {
  const scopes = useEditorSearchScopes();
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const combo = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      if (!combo || e.code !== "KeyK") return;
      // The same carve-out the search itself makes: a dialog owns the keyboard.
      if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"]'))
        return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The search opens and takes focus on this event, which it can only answer
  // once it has a box on screen to be focused in.
  useEffect(() => {
    if (!open) return;
    const handoff = requestAnimationFrame(() =>
      window.dispatchEvent(new Event("superSearch:focus")),
    );
    return () => cancelAnimationFrame(handoff);
  }, [open]);

  // Focus leaving closes it. The dropdown keeps focus on the input while it is
  // clicked, so reaching a result never counts as leaving.
  const handleBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <div
      ref={hostRef}
      className="reader-super-search"
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <SuperSearch scopes={scopes} />
    </div>
  );
}

export default ReaderSuperSearch;
