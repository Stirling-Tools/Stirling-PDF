import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "@mantine/core";
import {
  Button,
  Chip,
  EmptyState,
  Modal,
  Skeleton,
  StatusBadge,
  Table,
  type TableColumn,
} from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  deleteIntegration,
  fetchIntegrations,
  MANAGED_TYPES,
  type IntegrationConfig,
} from "@portal/api/integrations";
import { fetchUsers, type Member } from "@portal/api/users";
import { errorMessage } from "@portal/api/http";
import {
  TYPE_LABEL,
  TYPE_TONE,
} from "@portal/components/integrations/integrationTypes";
import { IntegrationEditorModal } from "@portal/components/integrations/IntegrationEditorModal";
import { ShareConfigModal } from "@portal/components/integrations/ShareConfigModal";
import "@portal/views/Integrations.css";

function scopeLabel(c: IntegrationConfig, t: (k: string, d: string) => string) {
  if (c.scope === "SERVER")
    return t("integrations.scope.server", "Whole organization");
  if (c.scope === "TEAM") return t("integrations.scope.team", "Team");
  return t("integrations.scope.user", "Personal");
}

export function Integrations() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const configState = useAsync<IntegrationConfig[]>(
    () => fetchIntegrations(),
    [refreshKey],
  );
  const membersState = useAsync(() => fetchUsers(tier), [tier]);

  const configs = useMemo(
    () =>
      (configState.data ?? []).filter((c) =>
        MANAGED_TYPES.includes(c.integrationType),
      ),
    [configState.data],
  );
  const members: Member[] = membersState.data?.members ?? [];
  // Sharing needs the admin-only roster; only admins can load it. If the fetch failed
  // (a non-admin who owns a personal config gets 403), hide sharing rather than open a
  // broken people-picker.
  const canShare = membersState.data != null;

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<IntegrationConfig | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState<IntegrationConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IntegrationConfig | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const loading = configState.loading && configState.data === null;
  const loadError = !configState.loading && configState.error !== null;
  const isEmpty = !configState.loading && !loadError && configs.length === 0;

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(c: IntegrationConfig) {
    setEditing(c);
    setEditorOpen(true);
  }
  function openShare(c: IntegrationConfig) {
    setSharing(c);
    setShareOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteIntegration(deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns = useMemo<TableColumn<IntegrationConfig>[]>(
    () => [
      {
        key: "name",
        header: t("integrations.table.name", "Name"),
        render: (c) => <strong>{c.name}</strong>,
      },
      {
        key: "type",
        header: t("integrations.table.type", "Type"),
        render: (c) => (
          <Chip accent={TYPE_TONE[c.integrationType]} size="sm">
            {TYPE_LABEL[c.integrationType]}
          </Chip>
        ),
      },
      {
        key: "scope",
        header: t("integrations.table.access", "Who can use it"),
        render: (c) => (
          <span className="portal-integrations__muted">{scopeLabel(c, t)}</span>
        ),
      },
      {
        key: "status",
        header: t("integrations.table.status", "Status"),
        render: (c) => (
          <StatusBadge
            tone={c.enabled ? "success" : "neutral"}
            size="sm"
            pulse={c.enabled}
          >
            {c.enabled
              ? t("integrations.status.active", "Active")
              : t("integrations.status.disabled", "Disabled")}
          </StatusBadge>
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        width: "3rem",
        render: (c) =>
          c.canManage ? (
            <Menu position="bottom-end" withinPortal shadow="md" width={190}>
              <Menu.Target>
                <button
                  type="button"
                  className="portal-integrations__row-action"
                  aria-label={t("integrations.table.actionsFor", {
                    name: c.name,
                    defaultValue: "Actions for {{name}}",
                  })}
                >
                  ⋯
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => openEdit(c)}>
                  {t("integrations.actions.edit", "Edit")}
                </Menu.Item>
                {canShare && (
                  <Menu.Item onClick={() => openShare(c)}>
                    {t("integrations.actions.share", "Share…")}
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item color="red" onClick={() => setDeleteTarget(c)}>
                  {t("integrations.actions.delete", "Delete")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            <span className="portal-integrations__muted">
              {t("integrations.table.readOnly", "Read-only")}
            </span>
          ),
      },
    ],
    [t, canShare],
  );

  return (
    <div className="portal-integrations">
      <header className="portal-integrations__head">
        <div>
          <h1 className="portal-integrations__title">
            {t("integrations.title", "Integrations")}
          </h1>
          <p className="portal-integrations__sub">
            {t(
              "integrations.subtitle",
              "Stored API and MCP connections for the workspace. (S3 connections live in Sources.)",
            )}
          </p>
        </div>
        <Button onClick={openCreate} leftSection={<span aria-hidden>+</span>}>
          {t("integrations.add", "Add integration")}
        </Button>
      </header>

      {actionError && (
        <p className="portal-integrations__error" role="alert">
          {actionError}
        </p>
      )}

      {loadError && (
        <EmptyState
          title={t(
            "integrations.loadError.title",
            "Couldn't load integrations",
          )}
          description={t(
            "integrations.loadError.description",
            "Something went wrong reaching the backend. Try again.",
          )}
          actions={
            <Button variant="secondary" onClick={refresh}>
              {t("common.retry", "Retry")}
            </Button>
          }
        />
      )}

      {loading && (
        <div className="portal-integrations__skeleton" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title={t("integrations.empty.title", "No integrations yet")}
          description={t(
            "integrations.empty.description",
            "Add an API or MCP connection to share it with your workspace.",
          )}
          actions={
            <Button onClick={openCreate}>
              {t("integrations.add", "Add integration")}
            </Button>
          }
        />
      )}

      {!loading && configs.length > 0 && (
        <Table<IntegrationConfig>
          className="portal-integrations__table"
          columns={columns}
          rows={configs}
          rowKey={(c) => String(c.id)}
        />
      )}

      <IntegrationEditorModal
        open={editorOpen}
        config={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={refresh}
      />
      <ShareConfigModal
        open={shareOpen}
        config={sharing}
        members={members}
        onClose={() => setShareOpen(false)}
      />

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        width="sm"
        title={t("integrations.delete.title", "Delete integration")}
        subtitle={deleteTarget?.name}
        footer={
          <div className="portal-integrations__modal-footer">
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setDeleteTarget(null)}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              size="sm"
              accent="danger"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {t("integrations.delete.confirm", "Delete")}
            </Button>
          </div>
        }
      >
        <p className="portal-integrations__delete-copy">
          {t(
            "integrations.delete.body",
            "This permanently removes the connection and everyone's access to it. This cannot be undone.",
          )}
        </p>
      </Modal>
    </div>
  );
}
