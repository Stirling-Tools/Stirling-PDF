import { useTranslation } from "react-i18next";
import { ActionIcon, Button } from "@app/ui";
import type { SourceView } from "@portal/api/sources";
import { SourceDetailPanel } from "@portal/components/sources/SourceDetailPanel";
import {
  EDITOR_SOURCE_TYPE,
  sourceTypeMeta,
} from "@portal/components/sources/sourceTypes";
import "@portal/views/Sources.css";
import CloseIcon from "@mui/icons-material/Close";

interface SourceDetailCardProps {
  source: SourceView;
  docSeries: number[];
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
  docSeries,
  onClose,
  onEdit,
  onTogglePause,
  onDelete,
  busy = false,
}: SourceDetailCardProps) {
  const { t } = useTranslation();
  const meta = sourceTypeMeta(source.type);
  const paused = source.status === "disabled";
  // The editor is a built-in source: it has no instance name and can't be edited/paused/deleted.
  const isEditor = source.type === EDITOR_SOURCE_TYPE;
  return (
    <section className="portal-sources__expanded">
      <header className="portal-sources__expanded-head">
        <span
          className={`portal-sources__type-dot portal-sources__type-dot--${meta.accent}`}
          aria-hidden
        >
          {meta.icon}
        </span>
        <div>
          <h2 className="portal-sources__expanded-title">
            {isEditor ? t(meta.labelKey) : source.name}
          </h2>
          <span className="portal-sources__expanded-sub">
            {t("portal.sources.detail.subtitle", {
              type: t(meta.labelKey),
              status: t(`portal.sources.status.${source.status}`),
            })}
          </span>
        </div>
        <ActionIcon
          variant="tertiary"
          className="portal-sources__expanded-close"
          onClick={onClose}
          aria-label={t("portal.sources.detail.closeAriaLabel")}
        >
          <CloseIcon />
        </ActionIcon>
      </header>

      <SourceDetailPanel source={source} docSeries={docSeries} />

      {!isEditor && (
        <div className="portal-sources__detail-actions">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onEdit(source)}
          >
            {t("portal.sources.detail.edit")}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onTogglePause(source)}
          >
            {paused
              ? t("portal.sources.detail.resume")
              : t("portal.sources.detail.pause")}
          </Button>
          <Button
            accent="danger"
            variant="secondary"
            disabled={busy}
            onClick={() => onDelete(source)}
          >
            {t("portal.sources.detail.delete")}
          </Button>
        </div>
      )}
    </section>
  );
}
