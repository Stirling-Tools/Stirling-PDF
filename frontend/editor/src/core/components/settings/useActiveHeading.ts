import { useCallback, useEffect, useRef, useState } from "react";
import type { SectionHeading } from "@app/components/settings/useSectionHeadings";

/** Where in the scroll container a card counts as the one being read. */
const ACTIVE_LINE = 120;
/** Long enough for a smooth scroll to land before the spy takes over again. */
const SETTLE_MS = 900;

function writeHash(id: string): void {
  if (window.location.hash.slice(1) === id) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}#${id}`,
  );
}

/**
 * Which card the reader is on, mirrored into the URL as `#slug`.
 *
 * Returns a `focus` for jumping to one. The hash is written with replaceState,
 * not the router, so scrolling cannot feed the deep-link effect that scrolls.
 */
export function useActiveHeading(
  container: HTMLElement | null,
  headings: SectionHeading[],
): { active: string | null; focus: (id: string) => void } {
  const [active, setActive] = useState<string | null>(null);
  // A click scrolls smoothly; without this the spy reads the frames on the way
  // and overwrites the slug the reader just asked for.
  const settleUntil = useRef(0);

  const focus = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Unfold first, or there is nothing to scroll to: the anchor is either a
    // folded card's own toggle, or a control inside its hidden panel.
    if (el.getAttribute("aria-expanded") === "false") {
      el.click();
    } else {
      el.closest(".settings-card__panel[hidden]")
        ?.parentElement?.querySelector<HTMLButtonElement>(
          ".settings-card__toggle",
        )
        ?.click();
    }
    settleUntil.current = Date.now() + SETTLE_MS;
    setActive(id);
    writeHash(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("settings-focus-target");
    window.setTimeout(() => el.classList.remove("settings-focus-target"), 1800);
  }, []);

  useEffect(() => {
    if (!container || headings.length === 0) {
      setActive(null);
      return;
    }

    let frame = 0;
    const read = () => {
      frame = 0;
      if (Date.now() < settleUntil.current) return;
      const line = container.getBoundingClientRect().top + ACTIVE_LINE;
      let current = headings[0]?.id ?? null;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= line) current = h.id;
      }
      // At the very bottom the last card wins, or it can never become active.
      if (
        container.scrollTop + container.clientHeight >=
        container.scrollHeight - 4
      ) {
        current = headings[headings.length - 1]?.id ?? current;
      }
      setActive(current);
      if (current) writeHash(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(read);
    };

    read();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [container, headings]);

  return { active, focus };
}
