import { useCallback, useEffect, useMemo, useState } from "react";
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
  fetchIntegrationCapabilities,
  fetchIntegrations,
  type IntegrationCapabilities,
  type IntegrationConfig,
} from "@portal/api/integrations";
import { SourcesIcon } from "@portal/components/icons";
import { ConnectionModal } from "@portal/components/sources/ConnectionModal";
import { connectionTypeOf } from "@portal/components/sources/connectionTypes";

/**
 * The Connections tab of the Sources page: the stored connections that sources, pipeline outputs
 * and integration steps reference by id — S3, Purview, ConsignO, and admin-authored custom APIs.
 * Create/edit go through the shared {@link ConnectionModal}; deleting one the backend still
 * references returns a 409, surfaced inline.
 */
export function ConnectionsTab() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<IntegrationConfig[] | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IntegrationConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<
    IntegrationCapabilities | undefined
  >(undefined);

  const refresh = useCallback(async () => {
    try {
      setConnections(await fetchIntegrations());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // What this caller may author. Left undefined on failure, which withholds the custom-API
  // option rather than offering something the backend would refuse.
  useEffect(() => {
    fetchIntegrationCapabilities().then(setCapabilities, () => undefined);
  }, []);

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
    setError(null);
    try {
      await deleteIntegration(connection.id);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
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
        key: "type",
        header: t("portal.connections.table.type"),
        render: (c) => {
          const type = connectionTypeOf(c.integrationType, c.config);
          return type ? t(type.labelKey) : c.integrationType;
        },
      },
      {
        key: "detail",
        header: t("portal.connections.table.detail"),
        render: (c) => (
          <span className="portal-sources__connections-bucket">
            {connectionDetail(c)}
          </span>
        ),
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

  const isLoading = connections === null;
  const isEmpty = connections !== null && connections.length === 0;

  return (
    <section className="portal-sources__connections">
      {/* The empty state carries its own heading and call to action, so the header row would
          only double the button and the copy - show it once there are connections to head. */}
      {!isEmpty && (
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
      )}

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

      <ConnectionModal
        open={modalOpen}
        connection={editing}
        capabilities={capabilities}
        onClose={() => setModalOpen(false)}
        onSaved={() => void refresh()}
      />
    </section>
  );
}

/**
 * The one line that identifies a connection at a glance. Per type, because "bucket" means nothing
 * to a Purview tenant and a base URL means nothing to S3. Never a secret: config arrives masked,
 * but only non-secret keys are shown regardless.
 */
function connectionDetail(connection: IntegrationConfig): string {
  const config = connection.config ?? {};
  switch (connection.integrationType) {
    case "S3":
      return String(config.bucket ?? "");
    case "PURVIEW":
      return String(config.tenantId ?? "");
    default:
      return String(config.baseUrl ?? "");
  }
}
