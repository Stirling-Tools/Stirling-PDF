import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  DataTable,
  Modal,
  column,
  type DataTableColumn,
  type StatusTone,
} from "@app/ui";
import { formatRelativeTime } from "@app/utils/timeUtils";
import { errorMessage } from "@portal/api/http";
import type {
  StoreTeamListing,
  StoreTeamListingStatus,
} from "@portal/api/store";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { useRemoveListing } from "@portal/queries/store";
import { useCopyToClipboard } from "@portal/components/store/StoreIdBadge";
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
 * The team's own listings, removed ones included. Removing is soft and confirmed here; Republish
 * hands off to the builder because the publish flow needs the pipeline itself, and is disabled when
 * no pipeline on this instance carries the listing's id.
 */
export function PublishedTable({
  rows,
  localPipelineByStoreId,
}: PublishedTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const remove = useRemoveListing();
  const { copy } = useCopyToClipboard();
  const [pendingRemove, setPendingRemove] = useState<StoreTeamListing | null>(
    null,
  );
  const [removeError, setRemoveError] = useState<string | null>(null);

  const storePath = toPortalPath(VIEW_PATHS.store);
  const pipelinesPath = toPortalPath(VIEW_PATHS.pipelines);
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
          header: t("portal.store.published.table.publishedBy"),
          sortable: true,
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
                  label: t("portal.store.published.actions.republish"),
                  disabled: !localId,
                  onClick: () => {
                    if (localId)
                      navigate(
                        `${pipelinesPath}/${encodeURIComponent(localId)}`,
                      );
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
                  onClick: () => {
                    setRemoveError(null);
                    setPendingRemove(row);
                  },
                },
              ],
            },
          ];
        },
      }),
    );
    return cols;
  }, [
    t,
    showPublishedBy,
    localPipelineByStoreId,
    navigate,
    storePath,
    pipelinesPath,
    copy,
  ]);

  async function confirmRemove() {
    if (!pendingRemove) return;
    try {
      await remove.mutateAsync(pendingRemove.storeId);
      setPendingRemove(null);
    } catch (e) {
      setRemoveError(errorMessage(e));
    }
  }

  return (
    <>
      <DataTable<StoreTeamListing>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.storeId}
        defaultSort={{ key: "updatedAt", direction: "desc" }}
      />

      <Modal
        open={pendingRemove !== null}
        onClose={() => !remove.isPending && setPendingRemove(null)}
        width="sm"
        title={t("portal.store.published.remove.title")}
        footer={
          <>
            <Button
              variant="tertiary"
              size="sm"
              disabled={remove.isPending}
              onClick={() => setPendingRemove(null)}
            >
              {t("portal.store.published.remove.cancel")}
            </Button>
            <Button
              size="sm"
              accent="danger"
              loading={remove.isPending}
              onClick={() => void confirmRemove()}
            >
              {t("portal.store.published.remove.confirm")}
            </Button>
          </>
        }
      >
        {removeError && <Banner tone="danger" description={removeError} />}
        <p>
          {t("portal.store.published.remove.body", {
            name: pendingRemove?.name ?? "",
            count: pendingRemove?.installCount ?? 0,
          })}
        </p>
      </Modal>
    </>
  );
}
