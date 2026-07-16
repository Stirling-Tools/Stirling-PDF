import { useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { Heading } from "@portal/docs/headings";

/**
 * "On this page" table of contents. Lists the current doc's H2/H3 headings,
 * scrolls the reading pane to a heading on click, and highlights the section
 * currently in view (scroll-spy against the pane's scroll container).
 */
export function DocsToc({
  headings,
  scrollRef,
}: {
  headings: Heading[];
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<string>(headings[0]?.slug ?? "");

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || headings.length === 0) return;
    setActive(headings[0].slug);

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        // The topmost heading currently within the active zone wins.
        const current = headings.find((h) => visible.has(h.slug));
        if (current) setActive(current.slug);
      },
      // Active zone = the top ~30% of the reading pane.
      { root, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    const els = headings
      .map((h) => root.querySelector(`[id="${h.slug}"]`))
      .filter((el): el is Element => el !== null);
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings, scrollRef]);

  const onSelect = (slug: string) => {
    scrollRef.current
      ?.querySelector(`[id="${slug}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
    setActive(slug);
  };

  return (
    <nav className="portal-docs__toc" aria-label={t("portal.docs.toc.title")}>
      <div className="portal-docs__toc-title">{t("portal.docs.toc.title")}</div>
      <ul className="portal-docs__toc-list">
        {headings.map((h) => (
          <li key={h.slug}>
            <a
              href={`#${h.slug}`}
              className={
                "portal-docs__toc-link" +
                (h.level === 3 ? " is-sub" : "") +
                (active === h.slug ? " is-active" : "")
              }
              aria-current={active === h.slug ? "location" : undefined}
              onClick={(e) => {
                e.preventDefault();
                onSelect(h.slug);
              }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
