import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
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
import { fetchOutputs, type OutputView } from "@portal/api/outputs";
import { SourcesIcon } from "@portal/components/icons";
import { outputTypeMeta } from "@portal/components/outputs/outputTypes";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";

/**
 * The Outputs tab of the Sources page: persisted output destinations (folder, S3)
 * that policies deliver to, referenced by id. Create/edit open the full-page
 * {@link OutputBuilder} (create/delete happen there), mirroring how sources work.
 */
export function OutputsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [outputs, setOutputs] = useState<OutputView[] | null>(null);
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

  const builderPath = toPortalPath(VIEW_PATHS.sources) + "/outputs";
  const openCreate = () => navigate(`${builderPath}/new`);
  const openEdit = (row: OutputView) => navigate(`${builderPath}/${row.id}`);

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
        key: "open",
        header: "",
        align: "right",
        width: "2.5rem",
        render: () => (
          <span className="portal-sources__caret" aria-hidden>
            <ChevronRightRoundedIcon style={{ fontSize: "1.25rem" }} />
          </span>
        ),
      },
    ],
    [t],
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
          onRowClick={openEdit}
        />
      )}
    </section>
  );
}
