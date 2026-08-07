import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  column,
  DataTable,
  type DataTableColumn,
  EmptyState,
} from "@app/ui";
import type { LinkedInstanceRow } from "@portal/api/link";

interface Props {
  instances: LinkedInstanceRow[];
  /** Called when the leader revokes a (non-revoked) instance. */
  onRevoke: (instance: LinkedInstanceRow) => void;
  /** instanceId currently being revoked — disables its button + shows progress. */
  revokingId?: number | null;
}

function relativeTime(iso: string | null, t: TFunction): string {
  if (!iso) return t("portal.accountLink.instances.time.never", "never");
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1)
    return t("portal.accountLink.instances.time.justNow", "just now");
  if (mins < 60)
    return t("portal.accountLink.instances.time.minutesAgo", "{{count}}m ago", {
      count: mins,
    });
  const hrs = Math.round(mins / 60);
  if (hrs < 24)
    return t("portal.accountLink.instances.time.hoursAgo", "{{count}}h ago", {
      count: hrs,
    });
  return t("portal.accountLink.instances.time.daysAgo", "{{count}}d ago", {
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
      header: t("portal.accountLink.instances.columns.instance", "Instance"),
      primary: (i) =>
        i.name ?? t("portal.accountLink.instances.unnamed", "Unnamed instance"),
      note: (i) => i.deviceId,
      noteMono: true,
    }),
    column.badge({
      key: "status",
      header: t("portal.accountLink.instances.columns.status", "Status"),
      get: (i) =>
        i.revoked
          ? {
              tone: "danger",
              label: t("portal.accountLink.instances.revoked", "Revoked"),
            }
          : {
              tone: "success",
              label: t("portal.accountLink.instances.active", "Active"),
            },
    }),
    column.muted({
      key: "lastSeen",
      header: t("portal.accountLink.instances.columns.lastSeen", "Last seen"),
      get: (i) => relativeTime(i.lastSeenAt, t),
    }),
    column.muted({
      key: "created",
      header: t("portal.accountLink.instances.columns.linked", "Linked"),
      get: (i) => relativeTime(i.createdAt, t),
    }),
    column.actions({
      key: "actions",
      get: (i) =>
        i.revoked
          ? []
          : [
              {
                label: t("portal.accountLink.instances.revoke", "Revoke"),
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
            "portal.accountLink.instances.empty.title",
            "No linked instances",
          )}
          description={t(
            "portal.accountLink.instances.empty.description",
            "Link this org's account, then register your self-hosted instances to see them here.",
          )}
        />
      }
    />
  );
}
