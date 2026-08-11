import { useTranslation } from "react-i18next";
import {
  Card,
  Chip,
  type ChipAccent,
  EmptyState,
  StatusBadge,
  Table,
  type TableColumn,
} from "@app/ui";
import {
  INSTANCE_STATUS_LABEL,
  INSTANCE_STATUS_TONE,
  TARGET_META,
  type EditorInstance,
} from "@processor/api/editorDeploy";

// Deployment target names are product/brand terms, not localised.
const TARGET_LABEL: Record<EditorInstance["target"], string> = {
  cloud: "Cloud",
  docker: "Docker",
  kubernetes: "K8s",
};

/** Map the target palette tone onto the shared Chip accent set. */
const TARGET_CHIP_ACCENT: Record<"neutral" | "blue" | "purple", ChipAccent> = {
  neutral: "neutral",
  blue: "default",
  purple: "premium",
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
      header: t("processor.editorAdmin.health.columns.host"),
      render: (i) => (
        <div className="processor-editor__cell-stack">
          <span className="processor-editor__cell-strong">{i.host}</span>
          <span className="processor-editor__cell-muted">
            <Chip
              size="sm"
              accent={TARGET_CHIP_ACCENT[TARGET_META[i.target].tone]}
            >
              {TARGET_LABEL[i.target]}
            </Chip>
          </span>
        </div>
      ),
    },
    {
      key: "version",
      header: t("processor.editorAdmin.health.columns.version"),
      render: (i) => (
        <code className="processor-editor__mono">{i.version}</code>
      ),
    },
    {
      key: "region",
      header: t("processor.editorAdmin.health.columns.region"),
      render: (i) => <span className="processor-editor__mono">{i.region}</span>,
    },
    {
      key: "status",
      header: t("processor.editorAdmin.health.columns.status"),
      render: (i) => (
        <StatusBadge tone={INSTANCE_STATUS_TONE[i.status]} size="sm">
          {t(INSTANCE_STATUS_LABEL[i.status])}
        </StatusBadge>
      ),
    },
    {
      key: "lastSeen",
      header: t("processor.editorAdmin.health.columns.lastSeen"),
      render: (i) => (
        <span className="processor-editor__muted">{i.lastSeen}</span>
      ),
    },
    {
      key: "activeUsers",
      header: t("processor.editorAdmin.health.columns.activeUsers"),
      align: "right",
      render: (i) => (
        <span className="processor-editor__mono">{i.activeUsers}</span>
      ),
    },
  ];

  return (
    <Card padding="none">
      {instances.length === 0 ? (
        <EmptyState
          size="compact"
          title={t("processor.editorAdmin.health.empty.title")}
          description={t("processor.editorAdmin.health.empty.description")}
        />
      ) : (
        <Table columns={cols} rows={instances} rowKey={(i) => i.id} />
      )}
    </Card>
  );
}
