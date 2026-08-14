import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
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
  CREATABLE_SOURCE_TYPES,
  EDITOR_SOURCE_TYPE,
  sourceTypeMeta,
} from "@portal/components/sources/sourceTypes";
import { SourceTypeIcon } from "@portal/components/sources/SourceTypeIcon";
import "@portal/views/Sources.css";

const PREVIEW_TYPES = CREATABLE_SOURCE_TYPES.slice(0, 3);
const MORE_TYPE_COUNT = CREATABLE_SOURCE_TYPES.length - PREVIEW_TYPES.length;

const STATUS_TONE: Record<SourceStatus, StatusTone> = {
  active: "success",
  unused: "neutral",
  disabled: "warning",
};

interface SourcesTableProps {
  sources: SourceView[];
  /** Opens a source's own page. Not called for the virtual editor row. */
  onRowClick: (source: SourceView) => void;
  /** Opens the connect flow from the table's trailing "connect a source" row. */
  onConnect: () => void;
}

export function SourcesTable({
  sources,
  onRowClick,
  onConnect,
}: SourcesTableProps) {
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
          <StatusBadge tone={STATUS_TONE[s.status]} size="sm">
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
        header: t("portal.sources.table.open"),
        headerHidden: true,
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
      footer={
        <button
          type="button"
          className="portal-sources__connect-row"
          onClick={onConnect}
        >
          <span className="portal-sources__connect-mark" aria-hidden>
            <AddRoundedIcon style={{ fontSize: "1.125rem" }} />
          </span>
          {t(
            "portal.sources.actions.connectAdditional",
            "Connect an additional source",
          )}
          <span className="portal-sources__connect-types" aria-hidden>
            {PREVIEW_TYPES.map((s) => (
              <span key={s.type} className="portal-sources__connect-chip">
                <SourceTypeIcon type={s.type} />
                {t(s.labelKey)}
              </span>
            ))}
            {MORE_TYPE_COUNT > 0 && (
              <span className="portal-sources__connect-more">
                {t("portal.sources.actions.moreTypes", "+{{count}} more", {
                  count: MORE_TYPE_COUNT,
                })}
              </span>
            )}
            <ChevronRightRoundedIcon
              className="portal-sources__connect-caret"
              style={{ fontSize: "1.125rem" }}
            />
          </span>
        </button>
      }
    />
  );
}
