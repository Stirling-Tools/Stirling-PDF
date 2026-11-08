import { useEffect, useState } from "react";

export interface SectionHeading {
  id: string;
  label: string;
}

/**
 * The cards the open settings section rendered, read back off the page.
 *
 * Taken from the DOM rather than a hand-kept list so it cannot drift: a page
 * that adds, removes or conditionally hides a card is reflected without anyone
 * remembering to update a registry. Sections load asynchronously, so this
 * re-reads on mutation until the page settles.
 */
export function useSectionHeadings(
  activeKey: string | undefined,
  container: HTMLElement | null,
): SectionHeading[] {
  const [headings, setHeadings] = useState<SectionHeading[]>([]);

  useEffect(() => {
    if (!container || !activeKey) {
      setHeadings([]);
      return;
    }
    const read = () => {
      // SettingsCard carries the id on its toggle button; pages that still
      // draw their own heading carry it on the h2.
      const found = [
        ...container.querySelectorAll<HTMLElement>(
          ".settings-card__toggle[id], h2[id]",
        ),
      ].map((el) => ({
        id: el.id,
        label:
          el.querySelector(".settings-card__title")?.textContent?.trim() ??
          el.textContent?.trim() ??
          el.id,
      }));
      setHeadings((prev) =>
        prev.length === found.length &&
        prev.every((p, i) => p.id === found[i].id && p.label === found[i].label)
          ? prev
          : found,
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activeKey, container]);

  return headings;
}
