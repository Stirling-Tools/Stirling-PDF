import { useTranslation } from "react-i18next";
import { Button } from "@shared/components";
import type { SourceView } from "@portal/api/sources";
import { SourceDetailPanel } from "@portal/components/sources/SourceDetailPanel";
import { sourceTypeMeta } from "@portal/components/sources/sourceTypes";
import "@portal/views/Sources.css";

interface SourceDetailCardProps {
  source: SourceView;
  onClose: () => void;
  onEdit: (source: SourceView) => void;
  onTogglePause: (source: SourceView) => void;
  onDelete: (source: SourceView) => void;
  /** Disables the actions while a mutation is in flight. */
  busy?: boolean;
}

/** Expanded detail for the selected source row, with edit/pause/delete actions. */
export function SourceDetailCard({
  source,
  onClose,
  onEdit,
  onTogglePause,
  onDelete,
  busy = false,
}: SourceDetailCardProps) {
  const { t } = useTranslation();
  const meta = sourceTypeMeta(source.type);
  const paused = source.status === "disabled";
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
              type: t(meta.labelKey),
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
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onEdit(source)}
        >
          {t("sources.detail.edit")}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onTogglePause(source)}
        >
          {paused ? t("sources.detail.resume") : t("sources.detail.pause")}
        </Button>
        <Button
          accent="red"
          variant="outline"
          disabled={busy}
          onClick={() => onDelete(source)}
        >
          {t("sources.detail.delete")}
        </Button>
      </div>
    </section>
  );
}
