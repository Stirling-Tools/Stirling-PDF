import { useTranslation } from "react-i18next";
import { Button } from "@shared/components";
import type { SourceView } from "@portal/api/sources";
import { SourceDetailPanel } from "@portal/components/sources/SourceDetailPanel";
import { sourceTypeMeta } from "@portal/components/sources/sourceTypes";
import "@portal/views/Sources.css";

interface SourceDetailCardProps {
  source: SourceView;
  onClose: () => void;
  onDelete: (source: SourceView) => void;
}

/** Expanded detail for the selected source row, with a delete action. */
export function SourceDetailCard({
  source,
  onClose,
  onDelete,
}: SourceDetailCardProps) {
  const { t } = useTranslation();
  const meta = sourceTypeMeta(source.type);
  return (
    <section className="portal-sources__expanded">
      <header className="portal-sources__expanded-head">
        <span
          className={`portal-sources__type-dot portal-sources__type-dot--${meta.tone}`}
          aria-hidden
        >
          {meta.icon}
        </span>
        <div>
          <h2 className="portal-sources__expanded-title">{source.name}</h2>
          <span className="portal-sources__expanded-sub">
            {t("sources.detail.subtitle", {
              type: meta.label,
              status: t(`sources.status.${source.status}`),
            })}
          </span>
        </div>
        <button
          type="button"
          className="portal-sources__expanded-close"
          onClick={onClose}
          aria-label={t("sources.detail.closeAriaLabel")}
        >
          ×
        </button>
      </header>

      <SourceDetailPanel source={source} />

      <div className="portal-sources__detail-actions">
        <Button accent="red" variant="outline" onClick={() => onDelete(source)}>
          {t("sources.detail.delete")}
        </Button>
      </div>
    </section>
  );
}
