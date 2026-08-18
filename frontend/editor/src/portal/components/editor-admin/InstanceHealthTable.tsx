import { useTranslation } from "react-i18next";
import { column, DataTable, type DataTableColumn, EmptyState } from "@app/ui";
import {
  INSTANCE_STATUS_LABEL,
  INSTANCE_STATUS_TONE,
  type EditorInstance,
} from "@portal/api/editorDeploy";

// Deployment target names are product/brand terms, not localised.
const TARGET_LABEL: Record<EditorInstance["target"], string> = {
  cloud: "Cloud",
  docker: "Docker",
  kubernetes: "K8s",
};

interface Props {
  instances: EditorInstance[];
}

/** Live health for every Editor instance reporting in to the org. */
export function InstanceHealthTable({ instances }: Props) {
  const { t } = useTranslation();

  const cols: DataTableColumn<EditorInstance>[] = [
    column.entity({
      key: "host",
      header: t("portal.editorAdmin.health.columns.host"),
      sortable: true,
      primary: (i) => i.host,
    }),
    column.text({
      key: "target",
      header: t("portal.editorAdmin.health.columns.target", "Target"),
      sortable: true,
      get: (i) => TARGET_LABEL[i.target],
    }),
    column.mono({
      key: "version",
      header: t("portal.editorAdmin.health.columns.version"),
      sortable: true,
      get: (i) => i.version,
    }),
    column.mono({
      key: "region",
      header: t("portal.editorAdmin.health.columns.region"),
      sortable: true,
      get: (i) => i.region,
    }),
    column.badge({
      key: "status",
      header: t("portal.editorAdmin.health.columns.status"),
      sortable: true,
      get: (i) => ({
        tone: INSTANCE_STATUS_TONE[i.status],
        label: t(INSTANCE_STATUS_LABEL[i.status]),
      }),
    }),
    column.muted({
      key: "lastSeen",
      header: t("portal.editorAdmin.health.columns.lastSeen"),
      get: (i) => i.lastSeen,
    }),
    column.number({
      key: "activeUsers",
      header: t("portal.editorAdmin.health.columns.activeUsers"),
      sortable: true,
      get: (i) => i.activeUsers,
    }),
  ];

  return (
    <DataTable<EditorInstance>
      columns={cols}
      rows={instances}
      rowKey={(i) => i.id}
      empty={
        <EmptyState
          size="compact"
          title={t("portal.editorAdmin.health.empty.title")}
          description={t("portal.editorAdmin.health.empty.description")}
        />
      }
    />
  );
}
