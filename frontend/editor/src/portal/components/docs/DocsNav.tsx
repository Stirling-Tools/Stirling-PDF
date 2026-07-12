import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Skeleton, StatusBadge } from "@app/ui";
import { useTranslation } from "react-i18next";
import type { DocsNavSection } from "@portal/api/docs";

/**
 * Left-hand documentation nav: a hierarchical accordion. Section ids encode their
 * path ("functionality/security" is a child of "functionality"), so sub-sections
 * nest under their parent. The root "Overview" section is static (always open, no
 * toggle); every other section collapses, and only the branch leading to the
 * active doc opens by default. (Search lives in DocsSearch above this.)
 */

// Matches the generator's ROOT_SECTION_ID: the intro section is never collapsible.
const STATIC_SECTION_ID = "overview";

interface NavNode {
  section: DocsNavSection;
  children: NavNode[];
}

/** Split "a/b/c" → "a/b"; null for a top-level id. */
function parentId(id: string): string | null {
  const i = id.lastIndexOf("/");
  return i === -1 ? null : id.slice(0, i);
}

/** Build the section tree from the flat, pre-sorted section list. */
function buildTree(sections: DocsNavSection[]): NavNode[] {
  const byId = new Map<string, NavNode>(
    sections.map((s) => [s.id, { section: s, children: [] }]),
  );
  const roots: NavNode[] = [];
  for (const node of byId.values()) {
    const pid = parentId(node.section.id);
    const parent = pid ? byId.get(pid) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function DocsNav({
  sections,
  active,
  onSelect,
}: {
  sections: DocsNavSection[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  // Per-section manual open/close, overriding the "active branch only" default.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const activeRef = useRef<HTMLButtonElement>(null);

  const activeSectionId = useMemo(
    () => sections.find((s) => s.items.some((i) => i.id === active))?.id,
    [sections, active],
  );

  const tree = useMemo(() => buildTree(sections), [sections]);

  // Keep the active item in view when navigating (e.g. via a cross-link).
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const isOpen = (id: string): boolean => {
    if (id === STATIC_SECTION_ID) return true;
    // Default-open the branch containing the active doc (self or ancestor).
    const onActivePath =
      !!activeSectionId &&
      (activeSectionId === id || activeSectionId.startsWith(id + "/"));
    return toggled[id] ?? onActivePath;
  };

  const renderNode = (node: NavNode) => {
    const { section, children } = node;
    const isStatic = section.id === STATIC_SECTION_ID;
    const open = isOpen(section.id);
    return (
      <div key={section.id} className="portal-docs__nav-group">
        {isStatic ? (
          <div className="portal-docs__nav-head">{section.label}</div>
        ) : (
          <Button
            variant="tertiary"
            fullWidth
            justify="between"
            className="portal-docs__nav-head portal-docs__nav-head--button"
            aria-expanded={open}
            onClick={() =>
              setToggled((prev) => ({ ...prev, [section.id]: !open }))
            }
            rightSection={
              <span className="portal-docs__nav-count">
                {section.items.length}
              </span>
            }
          >
            <span className="portal-docs__nav-head-main">
              <span
                className={
                  "portal-docs__nav-chevron" + (open ? " is-open" : "")
                }
                aria-hidden
              >
                ▸
              </span>
              <span className="portal-docs__nav-headlabel">
                {section.label}
              </span>
            </span>
          </Button>
        )}

        {open && (
          <>
            {section.items.length > 0 && (
              <ul className="portal-docs__nav-list">
                {section.items.map((item) => {
                  const isActive = item.id === active;
                  return (
                    <li key={item.id}>
                      <Button
                        ref={isActive ? activeRef : undefined}
                        variant="tertiary"
                        justify="start"
                        fullWidth
                        className={
                          "portal-docs__nav-link" +
                          (isActive ? " is-active" : "")
                        }
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => onSelect(item.id)}
                      >
                        <span className="portal-docs__nav-label">
                          {item.label}
                        </span>
                        {item.badge && (
                          <StatusBadge
                            tone={item.badge === "New" ? "success" : "info"}
                            size="sm"
                          >
                            {item.badge}
                          </StatusBadge>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {children.length > 0 && (
              <div className="portal-docs__nav-children">
                {children.map(renderNode)}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <nav
      className="portal-docs__nav"
      aria-label={t("portal.docs.nav.ariaLabel")}
    >
      {tree.map(renderNode)}
    </nav>
  );
}

export function DocsNavSkeleton() {
  return (
    <nav className="portal-docs__nav" aria-hidden>
      {Array.from({ length: 5 }).map((_, gi) => (
        <div key={gi} className="portal-docs__nav-group">
          <Skeleton width="7rem" height="0.75rem" />
          {gi === 0 && (
            <div className="portal-docs__nav-list">
              {Array.from({ length: 4 }).map((_, li) => (
                <Skeleton key={li} width="80%" height="0.875rem" />
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
