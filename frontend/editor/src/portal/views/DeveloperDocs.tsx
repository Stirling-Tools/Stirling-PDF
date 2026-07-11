import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, EmptyState } from "@app/ui";
import { DocsNav } from "@portal/components/docs/DocsNav";
import { DocsSearch } from "@portal/components/docs/DocsSearch";
import { DocsSection } from "@portal/components/docs/DocsSection";
import { MarkdownDoc } from "@portal/components/docs/MarkdownDoc";
import {
  allDocs,
  firstDocId,
  loadDoc,
  loadDocsNav,
} from "@portal/docs/manifest/registry";
import { searchDocs, toPlainText, type SearchDoc } from "@portal/docs/search";
import "@portal/views/DeveloperDocs.css";

/**
 * Developer Docs — a markdown browser over the docs manifest generated from the
 * Stirling docs repo (see scripts/sync-portal-docs.mts). The nav is auto-sorted
 * from the repo's folders + frontmatter; content is the repo markdown, and the
 * search box does full-text search across every doc.
 */
export function DeveloperDocs() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLElement>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState("");

  const nav = useMemo(() => loadDocsNav(), []);
  const fallback = useMemo(() => firstDocId(), []);

  // Full-text index over every doc's plaintext body (built once).
  const index = useMemo<SearchDoc[]>(() => {
    const labels = new Map(nav.map((s) => [s.id, s.label]));
    return allDocs().map((d) => ({
      id: d.id,
      title: d.title,
      sectionLabel: labels.get(d.section) ?? "",
      text: toPlainText(d.markdown),
    }));
  }, [nav]);
  const results = useMemo(() => searchDocs(index, query), [index, query]);
  const searching = query.trim().length > 0;

  // Deep-link support: the active doc id lives in the URL hash.
  const hashId = decodeURIComponent(hash.replace(/^#/, ""));
  const activeId = hashId && loadDoc(hashId) ? hashId : fallback;
  const doc = activeId ? loadDoc(activeId) : undefined;
  const section = useMemo(
    () => nav.find((s) => s.items.some((i) => i.id === activeId)),
    [nav, activeId],
  );

  // Navigating closes the mobile drawer, clears the search, and resets the pane.
  const onSelect = useCallback(
    (id: string) => {
      navigate({ hash: id });
      setNavOpen(false);
      setQuery("");
    },
    [navigate],
  );

  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 });
  }, [activeId]);

  if (nav.length === 0 || !doc) {
    return (
      <div className="portal-docs portal-docs--empty">
        <EmptyState
          title={t("portal.docs.nav.empty.title")}
          description={t("portal.docs.nav.empty.description")}
        />
      </div>
    );
  }

  return (
    <div className="portal-docs">
      <Button
        variant="tertiary"
        className="portal-docs__nav-toggle"
        aria-expanded={navOpen}
        onClick={() => setNavOpen((open) => !open)}
        leftSection={<span aria-hidden>☰</span>}
      >
        {t("portal.docs.browse")}
      </Button>

      <aside className={"portal-docs__sidebar" + (navOpen ? " is-open" : "")}>
        <DocsSearch
          query={query}
          onQueryChange={setQuery}
          results={results}
          onSelect={onSelect}
        />
        {!searching && (
          <DocsNav sections={nav} active={activeId ?? ""} onSelect={onSelect} />
        )}
      </aside>

      <main className="portal-docs__content" ref={contentRef}>
        <div className="portal-docs__content-inner">
          <DocsSection
            id={doc.id}
            eyebrow={section?.label ?? ""}
            title={doc.title}
            lead={doc.description}
          >
            <MarkdownDoc markdown={doc.markdown} onNavigate={onSelect} />
            <div className="portal-docs__source">
              <a href={doc.editUrl} target="_blank" rel="noopener noreferrer">
                {t("portal.docs.viewSource")}
              </a>
            </div>
          </DocsSection>
        </div>
      </main>
    </div>
  );
}
