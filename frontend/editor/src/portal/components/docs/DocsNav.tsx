import { useTranslation } from "react-i18next";
import { Skeleton, StatusBadge } from "@shared/components";
import type { DocsNavSection } from "@portal/api/docs";

/** Left-hand documentation nav tree; each leaf selects an in-page section. */
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
  return (
    <nav className="portal-docs__nav" aria-label={t("docs.nav.ariaLabel")}>
      {sections.map((section) => (
        <div key={section.id} className="portal-docs__nav-group">
          <div className="portal-docs__nav-head">
            <span className="portal-docs__nav-icon" aria-hidden>
              {section.icon}
            </span>
            {section.label}
          </div>
          <ul className="portal-docs__nav-list">
            {section.items.map((item) => {
              const isActive = item.id === active;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      "portal-docs__nav-link" + (isActive ? " is-active" : "")
                    }
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onSelect(item.id)}
                  >
                    <span className="portal-docs__nav-label">{item.label}</span>
                    {item.badge && (
                      <StatusBadge
                        tone={item.badge === "New" ? "success" : "info"}
                        size="sm"
                      >
                        {item.badge}
                      </StatusBadge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsNavSkeleton() {
  return (
    <nav className="portal-docs__nav" aria-hidden>
      {Array.from({ length: 4 }).map((_, gi) => (
        <div key={gi} className="portal-docs__nav-group">
          <Skeleton width="7rem" height="0.75rem" />
          <div className="portal-docs__nav-list">
            {Array.from({ length: 3 }).map((_, li) => (
              <Skeleton key={li} width="80%" height="0.875rem" />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
