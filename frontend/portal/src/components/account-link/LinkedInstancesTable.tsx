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

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** List of linked self-hosted instances with a leader-only revoke action. */
export function LinkedInstancesTable({
  instances,
  onRevoke,
  revokingId,
}: Props) {
  const cols: TableColumn<LinkedInstanceRow>[] = [
    {
      key: "name",
      header: "Instance",
      render: (i) => (
        <div className="portal-link__cell-stack">
          <span className="portal-link__cell-strong">
            {i.name ?? "Unnamed instance"}
          </span>
          <code className="portal-link__device-id">{i.deviceId}</code>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (i) =>
        i.revoked ? (
          <StatusBadge tone="danger" size="sm">
            Revoked
          </StatusBadge>
        ) : (
          <StatusBadge tone="success" size="sm" pulse>
            Active
          </StatusBadge>
        ),
    },
    {
      key: "lastSeen",
      header: "Last seen",
      render: (i) => (
        <span className="portal-link__muted">{relativeTime(i.lastSeenAt)}</span>
      ),
    },
    {
      key: "created",
      header: "Linked",
      render: (i) => (
        <span className="portal-link__muted">{relativeTime(i.createdAt)}</span>
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
            Revoke
          </Button>
        ),
    },
  ];

  return (
    <Card padding="none">
      {instances.length === 0 ? (
        <EmptyState
          size="compact"
          title="No linked instances"
          description="Link this org's account, then register your self-hosted instances to see them here."
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
