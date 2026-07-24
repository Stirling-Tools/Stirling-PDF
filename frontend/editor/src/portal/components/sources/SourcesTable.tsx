import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import {
  Chip,
  StatusBadge,
  type StatusTone,
  Table,
  type TableColumn,
} from "@app/ui";
import type { SourceStatus, SourceView } from "@portal/api/sources";
import {
  EDITOR_SOURCE_TYPE,
  sourceTypeMeta,
} from "@portal/components/sources/sourceTypes";
import { SourceTypeIcon } from "@portal/components/sources/SourceTypeIcon";
import "@portal/views/Sources.css";

const STATUS_TONE: Record<SourceStatus, StatusTone> = {
  active: "success",
  unused: "neutral",
  disabled: "warning",
};

interface SourcesTableProps {
  sources: SourceView[];
  /** Opens a source's own page. Not called for the virtual editor row. */
  onRowClick: (source: SourceView) => void;
}

export function SourcesTable({ sources, onRowClick }: SourcesTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<TableColumn<SourceView>[]>(
    () => [
      {
        key: "name",
        header: t("portal.sources.table.source"),
        render: (s) => {
          const meta = sourceTypeMeta(s.type);
          // The editor is a system source with no instance name: label it from its type and drop
          // the chip, which would just repeat the name.
          const isEditor = s.type === EDITOR_SOURCE_TYPE;
          return (
            <div className="portal-sources__name-cell">
              <span className="portal-sources__type-dot" aria-hidden>
                <SourceTypeIcon type={s.type} />
              </span>
              <div className="portal-sources__name-text">
                <strong>{isEditor ? t(meta.labelKey) : s.name}</strong>
                {!isEditor && (
                  <Chip accent={meta.accent} size="sm">
                    {t(meta.labelKey)}
                  </Chip>
                )}
              </div>
            </div>
          );
        },
      },
      {
        key: "status",
        header: t("portal.sources.table.status"),
        render: (s) => (
          <StatusBadge
            tone={STATUS_TONE[s.status]}
            size="sm"
            pulse={s.status === "active"}
          >
            {t(`portal.sources.status.${s.status}`)}
          </StatusBadge>
        ),
      },
      {
        key: "docs",
        header: t("portal.sources.table.documents"),
        align: "right",
        render: (s) => (
          <span
            className={s.docsTotal === 0 ? "portal-sources__muted" : undefined}
          >
            {s.docsTotal.toLocaleString()}
          </span>
        ),
      },
      {
        key: "referenceCount",
        header: t("portal.sources.table.usedBy"),
        align: "right",
        render: (s) => (
          <span
            className={
              s.referenceCount === 0 ? "portal-sources__muted" : undefined
            }
          >
            {s.referenceCount}
          </span>
        ),
      },
      {
        key: "open",
        header: "",
        align: "right",
        width: "2.5rem",
        // The editor source has no page to open, so it shows no chevron.
        render: (s) =>
          s.type === EDITOR_SOURCE_TYPE ? null : (
            <span className="portal-sources__caret" aria-hidden>
              <ChevronRightRoundedIcon style={{ fontSize: "1.25rem" }} />
            </span>
          ),
      },
    ],
    [t],
  );

  return (
    <Table<SourceView>
      className="portal-sources__table"
      columns={columns}
      rows={sources}
      rowKey={(s) => s.id}
      onRowClick={onRowClick}
      // The virtual editor row has no page to open, so it's inert - not a fake button.
      isRowInteractive={(s) => s.type !== EDITOR_SOURCE_TYPE}
    />
  );
}
