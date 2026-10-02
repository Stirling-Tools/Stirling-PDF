import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DataTable,
  column,
  type DataTableColumn,
  type StatusTone,
} from "@app/ui";
import { formatRelativeTime } from "@app/utils/timeUtils";
import type {
  StoreTeamListing,
  StoreTeamListingStatus,
} from "@portal/api/store";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { InfoHint } from "@portal/components/InfoHint";
import { useCopyToClipboard } from "@portal/components/store/StoreIdBadge";
import { RemoveListingModal } from "@portal/components/store/RemoveListingModal";
import { RepublishModal } from "@portal/components/store/RepublishModal";
import { storeShareUrl } from "@portal/components/store/storeTools";

const STATUS_TONE: Record<StoreTeamListingStatus, StatusTone> = {
  LISTED: "success",
  REMOVED: "neutral",
};

interface PublishedTableProps {
  rows: StoreTeamListing[];
  /** Local pipeline id per store id, for Republish (which needs a pipeline to run the flow on). */
  localPipelineByStoreId: Map<string, string>;
}

/**
 * The team's own listings, removed ones included. Republish opens the publish flow on the pipeline
 * that carries the listing's id, and is disabled when none on this instance does; Edit listing
 * changes the words only, on the listing page. Removing is soft and confirmed here.
 */
export function PublishedTable({
  rows,
  localPipelineByStoreId,
}: PublishedTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { copy } = useCopyToClipboard();
  const [pendingRemove, setPendingRemove] = useState<StoreTeamListing | null>(
    null,
  );
  const [republishId, setRepublishId] = useState<string | null>(null);

  const storePath = toPortalPath(VIEW_PATHS.store);
  const showPublishedBy = rows.some((row) => row.publishedBy);

  const columns = useMemo<DataTableColumn<StoreTeamListing>[]>(() => {
    const cols: DataTableColumn<StoreTeamListing>[] = [
      column.entity({
        key: "name",
        header: t("portal.store.published.table.pipeline"),
        sortable: true,
        primary: (row) => row.name,
        note: (row) => row.storeId,
      }),
      column.number({
        key: "stars",
        header: t("portal.store.published.table.stars"),
        sortable: true,
        get: (row) => row.starCount,
      }),
      column.number({
        key: "installs",
        header: t("portal.store.published.table.installs"),
        sortable: true,
        get: (row) => row.installCount,
      }),
      column.badge({
        key: "status",
        header: t("portal.store.published.table.status"),
        sortable: true,
        get: (row) => ({
          tone: STATUS_TONE[row.status],
          label: t(`portal.store.published.status.${row.status}`),
        }),
      }),
      column.muted({
        key: "updatedAt",
        header: t("portal.store.published.table.lastPublished"),
        sortable: true,
        get: (row) => formatRelativeTime(new Date(row.updatedAt).getTime(), t),
        sortBy: (row) => row.updatedAt,
      }),
    ];
    if (showPublishedBy) {
      cols.push(
        column.text({
          key: "publishedBy",
          header: (
            <span className="portal-store__header-hint">
              {t("portal.store.published.table.publishedBy")}
              <InfoHint
                content={t("portal.store.published.banner")}
                label={t("portal.store.published.bannerLabel")}
              />
            </span>
          ),
          // Not sortable: a sortable header is a button, and the hint inside it is one too.
          sortable: false,
          get: (row) => row.publishedBy ?? "-",
        }),
      );
    }
    cols.push(
      column.actions({
        key: "actions",
        get: (row) => {
          const localId = localPipelineByStoreId.get(row.storeId);
          return [
            {
              label: t("portal.store.published.actions.label"),
              glyph: "kebab",
              iconOnly: true,
              menu: [
                {
                  label: t("portal.store.published.actions.view"),
                  onClick: () =>
                    navigate(`${storePath}/${encodeURIComponent(row.storeId)}`),
                },
                {
                  label: t("portal.store.published.actions.edit"),
                  disabled: row.removedBy === "STAFF",
                  onClick: () =>
                    navigate(
                      `${storePath}/${encodeURIComponent(row.storeId)}?edit=1`,
                    ),
                },
                {
                  label: t("portal.store.published.actions.republish"),
                  disabled: !localId || row.removedBy === "STAFF",
                  onClick: () => {
                    if (localId) setRepublishId(localId);
                  },
                },
                {
                  label: t("portal.store.published.actions.copyLink"),
                  onClick: () => void copy(storeShareUrl(row.storeId)),
                },
                {
                  label: t("portal.store.published.actions.remove"),
                  tone: "danger",
                  dividerBefore: true,
                  disabled:
                    row.status === "REMOVED" || row.removedBy === "STAFF",
                  onClick: () => setPendingRemove(row),
                },
              ],
            },
          ];
        },
      }),
    );
    return cols;
  }, [t, showPublishedBy, localPipelineByStoreId, navigate, storePath, copy]);

  return (
    <>
      <DataTable<StoreTeamListing>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.storeId}
        defaultSort={{ key: "updatedAt", direction: "desc" }}
      />

      <RemoveListingModal
        listing={pendingRemove}
        onClose={() => setPendingRemove(null)}
      />
      <RepublishModal
        pipelineId={republishId}
        onClose={() => setRepublishId(null)}
      />
    </>
  );
}
