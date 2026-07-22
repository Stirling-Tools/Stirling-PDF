import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import {
  Banner,
  Button,
  EmptyState,
  Skeleton,
  Table,
  type TableColumn,
} from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  deleteIntegration,
  type IntegrationConfig,
} from "@portal/api/integrations";
import { useS3Connections } from "@portal/queries/sources";
import { qk } from "@portal/queries/keys";
import { SourcesIcon } from "@portal/components/icons";
import { S3ConnectionModal } from "@portal/components/sources/S3ConnectionModal";

/**
 * The Connections tab of the Sources page: stored S3 connections that sources
 * and pipeline outputs reference by id. Create/edit go through the shared
 * {@link S3ConnectionModal}; deleting one the backend still references returns a
 * 409, surfaced inline.
 */
export function ConnectionsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const state = useS3Connections();
  const connections = state.data;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IntegrationConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Surface a mutation failure first, else a fetch failure from the query.
  const error = actionError ?? (state.error ? errorMessage(state.error) : null);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.s3Connections() }),
    [queryClient],
  );

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(connection: IntegrationConfig) {
    setEditing(connection);
    setModalOpen(true);
  }

  async function remove(connection: IntegrationConfig) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteIntegration(connection.id);
      await refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<TableColumn<IntegrationConfig>[]>(
    () => [
      {
        key: "name",
        header: t("portal.connections.table.name"),
        render: (c) => <strong>{c.name}</strong>,
      },
      {
        key: "bucket",
        header: t("portal.connections.table.bucket"),
        render: (c) => (
          <span className="portal-sources__connections-bucket">
            {String(c.config?.bucket ?? "")}
          </span>
        ),
      },
      {
        key: "region",
        header: t("portal.connections.table.region"),
        render: (c) => String(c.config?.region ?? ""),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        render: (c) =>
          c.canManage ? (
            <span className="portal-sources__connections-actions">
              <Button
                variant="tertiary"
                size="sm"
                disabled={busy}
                onClick={() => openEdit(c)}
              >
                {t("portal.connections.edit")}
              </Button>
              <Button
                variant="tertiary"
                size="sm"
                accent="danger"
                disabled={busy}
                onClick={() => void remove(c)}
              >
                {t("portal.connections.delete")}
              </Button>
            </span>
          ) : null,
      },
    ],
    // remove/openEdit are stable enough for this admin surface; busy gates them.
    [t, busy],
  );

  const isLoading = state.loading && connections === null;
  const isEmpty = !isLoading && (connections?.length ?? 0) === 0;

  return (
    <section className="portal-sources__connections">
      <div className="portal-sources__connections-head">
        <p className="portal-sources__connections-sub">
          {t("portal.connections.subtitle")}
        </p>
        <Button
          onClick={openCreate}
          leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
        >
          {t("portal.connections.actions.new")}
        </Button>
      </div>

      {error && <Banner tone="danger" description={error} />}

      {isLoading && (
        <div className="portal-sources__table-skeleton" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon={<SourcesIcon size={28} />}
          title={t("portal.connections.empty.title")}
          description={t("portal.connections.empty.description")}
          actions={
            <Button
              onClick={openCreate}
              leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
            >
              {t("portal.connections.actions.new")}
            </Button>
          }
        />
      )}

      {connections !== null && connections.length > 0 && (
        <Table<IntegrationConfig>
          className="portal-sources__connections-table"
          columns={columns}
          rows={connections}
          rowKey={(c) => String(c.id)}
        />
      )}

      <S3ConnectionModal
        open={modalOpen}
        connection={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => void refresh()}
      />
    </section>
  );
}
