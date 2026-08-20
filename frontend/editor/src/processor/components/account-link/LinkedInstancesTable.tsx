import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { column, DataTable, type DataTableColumn, EmptyState } from "@app/ui";
import type { LinkedInstanceRow } from "@processor/api/link";

interface Props {
  instances: LinkedInstanceRow[];
  /** Called when the leader revokes a (non-revoked) instance. */
  onRevoke: (instance: LinkedInstanceRow) => void;
  /** instanceId currently being revoked — disables its button + shows progress. */
  revokingId?: number | null;
}

function relativeTime(iso: string | null, t: TFunction): string {
  if (!iso) return t("processor.accountLink.instances.time.never", "never");
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1)
    return t("processor.accountLink.instances.time.justNow", "just now");
  if (mins < 60)
    return t(
      "processor.accountLink.instances.time.minutesAgo",
      "{{count}}m ago",
      {
        count: mins,
      },
    );
  const hrs = Math.round(mins / 60);
  if (hrs < 24)
    return t(
      "processor.accountLink.instances.time.hoursAgo",
      "{{count}}h ago",
      {
        count: hrs,
      },
    );
  return t("processor.accountLink.instances.time.daysAgo", "{{count}}d ago", {
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
  const cols: DataTableColumn<LinkedInstanceRow>[] = [
    column.entity({
      key: "name",
      header: t("processor.accountLink.instances.columns.instance", "Instance"),
      sortable: true,
      primary: (i) =>
        i.name ??
        t("processor.accountLink.instances.unnamed", "Unnamed instance"),
      note: (i) => i.deviceId,
    }),
    column.badge({
      key: "status",
      header: t("processor.accountLink.instances.columns.status", "Status"),
      sortable: true,
      get: (i) =>
        i.revoked
          ? {
              tone: "danger",
              label: t("processor.accountLink.instances.revoked", "Revoked"),
            }
          : {
              tone: "success",
              label: t("processor.accountLink.instances.active", "Active"),
            },
    }),
    column.muted({
      key: "lastSeen",
      header: t(
        "processor.accountLink.instances.columns.lastSeen",
        "Last seen",
      ),
      sortable: true,
      // Sort on the real ISO timestamp, not the "3d ago" label.
      sortBy: (i) => i.lastSeenAt ?? undefined,
      get: (i) => relativeTime(i.lastSeenAt, t),
    }),
    column.muted({
      key: "created",
      header: t("processor.accountLink.instances.columns.linked", "Linked"),
      sortable: true,
      sortBy: (i) => i.createdAt ?? undefined,
      get: (i) => relativeTime(i.createdAt, t),
    }),
    column.actions({
      key: "actions",
      get: (i) =>
        i.revoked
          ? []
          : [
              {
                label: t("processor.accountLink.instances.revoke", "Revoke"),
                tone: "danger",
                loading: revokingId === i.instanceId,
                onClick: () => onRevoke(i),
              },
            ],
    }),
  ];

  return (
    <DataTable<LinkedInstanceRow>
      columns={cols}
      rows={instances}
      rowKey={(i) => String(i.instanceId)}
      empty={
        <EmptyState
          size="compact"
          title={t(
            "processor.accountLink.instances.empty.title",
            "No linked instances",
          )}
          description={t(
            "processor.accountLink.instances.empty.description",
            "Link this org's account, then register your self-hosted instances to see them here.",
          )}
        />
      }
    />
  );
}
