import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  Skeleton,
  Table,
  type TableColumn,
} from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  deleteOutput,
  fetchOutput,
  fetchOutputs,
  type Output,
  type OutputView,
} from "@portal/api/outputs";
import { SourcesIcon } from "@portal/components/icons";
import { outputTypeMeta } from "@portal/components/outputs/outputTypes";
import { OutputModal } from "@portal/components/outputs/OutputModal";

/**
 * The Outputs tab of the Sources page: persisted output destinations (folder, S3)
 * that policies deliver to, referenced by id. Create/edit go through the shared
 * {@link OutputModal}; deleting one a policy still references returns a 409,
 * surfaced inline. Mirrors {@link ConnectionsTab}.
 */
export function OutputsTab() {
  const { t } = useTranslation();
  const [outputs, setOutputs] = useState<OutputView[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Output | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOutputs((await fetchOutputs()).outputs);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  async function openEdit(row: OutputView) {
    setError(null);
    try {
      // The overview row carries only display config; fetch the raw record for editing.
      setEditing(await fetchOutput(row.id));
      setModalOpen(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(row: OutputView) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteOutput(row.id);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<TableColumn<OutputView>[]>(
    () => [
      {
        key: "name",
        header: t("portal.outputs.table.name"),
        render: (o) => <strong>{o.name}</strong>,
      },
      {
        key: "type",
        header: t("portal.outputs.table.type"),
        render: (o) => {
          const meta = outputTypeMeta(o.type);
          return (
            <Chip accent={meta.accent} size="sm">
              {t(meta.labelKey)}
            </Chip>
          );
        },
      },
      {
        key: "references",
        header: t("portal.outputs.table.references"),
        render: (o) =>
          o.referenceCount === 0
            ? t("portal.outputs.table.unused")
            : t("portal.outputs.table.referencedBy", {
                count: o.referenceCount,
              }),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        render: (o) => (
          <span className="portal-sources__connections-actions">
            <Button
              variant="tertiary"
              size="sm"
              disabled={busy}
              onClick={() => void openEdit(o)}
            >
              {t("portal.outputs.edit")}
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              accent="danger"
              disabled={busy}
              onClick={() => void remove(o)}
            >
              {t("portal.outputs.delete")}
            </Button>
          </span>
        ),
      },
    ],
    // remove/openEdit are stable enough for this admin surface; busy gates them.
    [t, busy],
  );

  const isLoading = outputs === null;
  const isEmpty = outputs !== null && outputs.length === 0;

  return (
    <section className="portal-sources__connections">
      <div className="portal-sources__connections-head">
        <p className="portal-sources__connections-sub">
          {t("portal.outputs.subtitle")}
        </p>
        <Button
          onClick={openCreate}
          leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
        >
          {t("portal.outputs.actions.new")}
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
          title={t("portal.outputs.empty.title")}
          description={t("portal.outputs.empty.description")}
          actions={
            <Button
              onClick={openCreate}
              leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
            >
              {t("portal.outputs.actions.new")}
            </Button>
          }
        />
      )}

      {outputs !== null && outputs.length > 0 && (
        <Table<OutputView>
          className="portal-sources__connections-table"
          columns={columns}
          rows={outputs}
          rowKey={(o) => o.id}
        />
      )}

      <OutputModal
        open={modalOpen}
        output={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => void refresh()}
      />
    </section>
  );
}
