import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Button,
  Card,
  EmptyState,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
import type { LinkedInstanceRow } from "@portal/api/link";

interface Props {
  instances: LinkedInstanceRow[];
  /** Called when the leader revokes a (non-revoked) instance. */
  onRevoke: (instance: LinkedInstanceRow) => void;
  /** instanceId currently being revoked — disables its button + shows progress. */
  revokingId?: number | null;
}

function relativeTime(iso: string | null, t: TFunction): string {
  if (!iso) return t("accountLink.instances.time.never", "never");
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return t("accountLink.instances.time.justNow", "just now");
  if (mins < 60)
    return t("accountLink.instances.time.minutesAgo", "{{count}}m ago", {
      count: mins,
    });
  const hrs = Math.round(mins / 60);
  if (hrs < 24)
    return t("accountLink.instances.time.hoursAgo", "{{count}}h ago", {
      count: hrs,
    });
  return t("accountLink.instances.time.daysAgo", "{{count}}d ago", {
    count: Math.round(hrs / 24),
  });
}

/** List of linked self-hosted instances with a leader-only revoke action. */
export function LinkedInstancesTable({
  instances,
  onRevoke,
  revokingId,
}: Props) {
  const { t } = useTranslation();
  const cols: TableColumn<LinkedInstanceRow>[] = [
    {
      key: "name",
      header: t("accountLink.instances.columns.instance", "Instance"),
      render: (i) => (
        <div className="portal-link__cell-stack">
          <span className="portal-link__cell-strong">
            {i.name ?? t("accountLink.instances.unnamed", "Unnamed instance")}
          </span>
          <code className="portal-link__device-id">{i.deviceId}</code>
        </div>
      ),
    },
    {
      key: "status",
      header: t("accountLink.instances.columns.status", "Status"),
      render: (i) =>
        i.revoked ? (
          <StatusBadge tone="danger" size="sm">
            {t("accountLink.instances.revoked", "Revoked")}
          </StatusBadge>
        ) : (
          <StatusBadge tone="success" size="sm" pulse>
            {t("accountLink.instances.active", "Active")}
          </StatusBadge>
        ),
    },
    {
      key: "lastSeen",
      header: t("accountLink.instances.columns.lastSeen", "Last seen"),
      render: (i) => (
        <span className="portal-link__muted">
          {relativeTime(i.lastSeenAt, t)}
        </span>
      ),
    },
    {
      key: "created",
      header: t("accountLink.instances.columns.linked", "Linked"),
      render: (i) => (
        <span className="portal-link__muted">
          {relativeTime(i.createdAt, t)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (i) =>
        i.revoked ? null : (
          <Button
            variant="outline"
            accent="red"
            size="sm"
            loading={revokingId === i.instanceId}
            onClick={() => onRevoke(i)}
          >
            {t("accountLink.instances.revoke", "Revoke")}
          </Button>
        ),
    },
  ];

  return (
    <Card padding="none">
      {instances.length === 0 ? (
        <EmptyState
          size="compact"
          title={t("accountLink.instances.empty.title", "No linked instances")}
          description={t(
            "accountLink.instances.empty.description",
            "Link this org's account, then register your self-hosted instances to see them here.",
          )}
        />
      ) : (
        <Table
          columns={cols}
          rows={instances}
          rowKey={(i) => String(i.instanceId)}
        />
      )}
    </Card>
  );
}
