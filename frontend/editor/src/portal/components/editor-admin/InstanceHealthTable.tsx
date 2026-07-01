import { useTranslation } from "react-i18next";
import {
  Card,
  Chip,
  EmptyState,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
import {
  INSTANCE_STATUS_LABEL,
  INSTANCE_STATUS_TONE,
  TARGET_META,
  type EditorInstance,
} from "@portal/api/editorDeploy";

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

  const cols: TableColumn<EditorInstance>[] = [
    {
      key: "host",
      header: t("editorAdmin.health.columns.host"),
      render: (i) => (
        <div className="portal-editor__cell-stack">
          <span className="portal-editor__cell-strong">{i.host}</span>
          <span className="portal-editor__cell-muted">
            <Chip size="sm" tone={TARGET_META[i.target].tone}>
              {TARGET_LABEL[i.target]}
            </Chip>
          </span>
        </div>
      ),
    },
    {
      key: "version",
      header: t("editorAdmin.health.columns.version"),
      render: (i) => <code className="portal-editor__mono">{i.version}</code>,
    },
    {
      key: "region",
      header: t("editorAdmin.health.columns.region"),
      render: (i) => <span className="portal-editor__mono">{i.region}</span>,
    },
    {
      key: "status",
      header: t("editorAdmin.health.columns.status"),
      render: (i) => (
        <StatusBadge
          tone={INSTANCE_STATUS_TONE[i.status]}
          size="sm"
          pulse={i.status === "healthy"}
        >
          {INSTANCE_STATUS_LABEL[i.status]}
        </StatusBadge>
      ),
    },
    {
      key: "lastSeen",
      header: t("editorAdmin.health.columns.lastSeen"),
      render: (i) => <span className="portal-editor__muted">{i.lastSeen}</span>,
    },
    {
      key: "activeUsers",
      header: t("editorAdmin.health.columns.activeUsers"),
      align: "right",
      render: (i) => (
        <span className="portal-editor__mono">{i.activeUsers}</span>
      ),
    },
  ];

  return (
    <Card padding="none">
      {instances.length === 0 ? (
        <EmptyState
          size="compact"
          title={t("editorAdmin.health.empty.title")}
          description={t("editorAdmin.health.empty.description")}
        />
      ) : (
        <Table columns={cols} rows={instances} rowKey={(i) => i.id} />
      )}
    </Card>
  );
}
