import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, EmptyState } from "@app/ui";
import { DocsNav } from "@portal/components/docs/DocsNav";
import { DocsSection } from "@portal/components/docs/DocsSection";
import { DocsToc } from "@portal/components/docs/DocsToc";
import { MarkdownDoc } from "@portal/components/docs/MarkdownDoc";
import { extractHeadings } from "@portal/docs/headings";
import {
  firstDocId,
  loadDoc,
  loadDocsNav,
} from "@portal/docs/manifest/registry";
import "@portal/views/DeveloperDocs.css";

/**
 * Developer Docs — a markdown browser over the docs manifest generated from the
 * Stirling docs repo (see scripts/sync-portal-docs.mts). The nav is auto-sorted
 * from the repo's folders + frontmatter; content is the repo markdown. Full-text
 * search across docs lives in the global super search (Cmd/Ctrl+K).
 */
export function DeveloperDocs() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLElement>(null);
  const [navOpen, setNavOpen] = useState(false);

  const nav = useMemo(() => loadDocsNav(), []);
  const fallback = useMemo(() => firstDocId(), []);

  // Deep-link support: the active doc id lives in the URL hash.
  const hashId = decodeURIComponent(hash.replace(/^#/, ""));
  const activeId = hashId && loadDoc(hashId) ? hashId : fallback;
  const doc = activeId ? loadDoc(activeId) : undefined;
  const section = useMemo(
    () => nav.find((s) => s.items.some((i) => i.id === activeId)),
    [nav, activeId],
  );
  // "On this page" headings for the current doc.
  const headings = useMemo(
    () => (doc ? extractHeadings(doc.markdown) : []),
    [doc],
  );

  // Navigating closes the mobile drawer and resets the pane.
  const onSelect = useCallback(
    (id: string) => {
      navigate({ hash: id });
      setNavOpen(false);
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

  const hasToc = headings.length > 0;

  return (
    <div className={"portal-docs" + (hasToc ? " portal-docs--with-toc" : "")}>
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
        <DocsNav sections={nav} active={activeId ?? ""} onSelect={onSelect} />
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

      {hasToc && (
        <aside className="portal-docs__toc-col">
          <DocsToc headings={headings} scrollRef={contentRef} />
        </aside>
      )}
    </div>
  );
}
