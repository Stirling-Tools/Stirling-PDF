import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { DataTable, column } from "@app/ui/DataTable";
import {
  DataTableFilterBar,
  useDataTableFilters,
} from "@app/ui/DataTableFilterBar";
import { Icon } from "@app/ui/Icon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import type { StatusTone } from "@app/ui/StatusBadge";
import {
  isSigningItemClosed,
  needsSignature,
  type SigningItem,
} from "@app/utils/signingItems";
import { signingStatus } from "@app/utils/signingStatus";

type SessionRow = SigningItem & { unread?: boolean };

interface SigningSessionsTableProps {
  items: SessionRow[];
  loading: boolean;
  onOpen: (item: SigningItem) => void;
  onRefresh: () => void;
}

function statusKey(item: SigningItem): string {
  if (item.kind === "request") {
    if (item.myStatus === "SIGNED") return "signed";
    if (item.myStatus === "DECLINED") return "declined";
    if (needsSignature(item)) return "needsYou";
  }
  if (item.finalized) return "finalized";
  if (
    item.kind === "session" &&
    item.participantCount > 0 &&
    item.signedCount === item.participantCount
  )
    return "ready";
  return "awaiting";
}

const statusTones: Record<string, StatusTone> = {
  green: "success",
  blue: "info",
  red: "danger",
  yellow: "warning",
  orange: "warning",
};

/** Keep mounted while opening a session so search, facets and column sorting survive return navigation. */
export function SigningSessionsTable({
  items,
  loading,
  onOpen,
  onRefresh,
}: SigningSessionsTableProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("active");
  const statusLabels: Record<string, string> = {
    needsYou: t("signWorkspace.needsYou", "Needs your signature"),
    signed: t("sharedSign.filterSigned", "Signed"),
    declined: t("sharedSign.filterDeclined", "Declined"),
    finalized: t("certSign.finalized", "Finalized"),
    ready: t("certSign.readyToFinalize", "Ready to finalize"),
    awaiting: t("certSign.awaitingSignatures", "Awaiting signatures"),
  };
  const dueLabels: Record<string, string> = {
    overdue: t("sharedSign.filterOverdue", "Overdue"),
    upcoming: t("signWorkspace.upcoming", "Upcoming"),
    none: t("signWorkspace.noDueDate", "No due date"),
  };
  const owner = (item: SigningItem) =>
    item.kind === "session"
      ? t("signWorkspace.createdByMe", "Created by me")
      : item.ownerUsername;
  const rows = items.filter((item) =>
    tab === "unread"
      ? item.unread && !isSigningItemClosed(item)
      : isSigningItemClosed(item) === (tab === "closed"),
  );
  const filters = useDataTableFilters({
    rows,
    searchText: (item) => `${item.documentName} ${owner(item)}`,
    searchPlaceholder: t("signWorkspace.search", "Search documents or people"),
    facets: [
      {
        key: "owner",
        label: t("signWorkspace.owner", "Owner"),
        getValue: (item) =>
          item.kind === "session" ? "mine" : `user:${item.ownerUsername}`,
        formatValue: (value) =>
          value === "mine"
            ? t("signWorkspace.createdByMe", "Created by me")
            : value.slice(5),
      },
      {
        key: "status",
        label: t("signWorkspace.status", "Status"),
        getValue: statusKey,
        formatValue: (value) => statusLabels[value],
      },
      ...(tab !== "closed"
        ? [
            {
              key: "due",
              label: t("signWorkspace.dueDate", "Due date"),
              getValue: (item: SigningItem) =>
                !item.dueDate
                  ? "none"
                  : Date.parse(item.dueDate) < Date.now()
                    ? "overdue"
                    : "upcoming",
              formatValue: (value: string) => dueLabels[value],
            },
          ]
        : []),
    ],
  });
  const columns = [
    column.entity<SessionRow>({
      key: "document",
      header: t("signWorkspace.document", "Document"),
      sortable: true,
      primary: (item) => item.documentName,
      icon: () => <Icon name="file-text" size={18} />,
      unreadLabel: (item) =>
        item.unread
          ? t(
              "signMenu.newActivity",
              "New activity since you last viewed this session",
            )
          : undefined,
    }),
    column.text<SigningItem>({
      key: "owner",
      header: t("signWorkspace.owner", "Owner"),
      sortable: true,
      get: owner,
    }),
    column.badge<SigningItem>({
      key: "status",
      header: t("signWorkspace.status", "Status"),
      sortable: true,
      sortBy: (item) => statusLabels[statusKey(item)],
      get: (item) => {
        const status = signingStatus(item, t);
        return needsSignature(item)
          ? { tone: "warning", label: statusLabels.needsYou }
          : {
              tone: statusTones[status.color] ?? "neutral",
              label: status.label,
            };
      },
    }),
    column.number<SigningItem>({
      key: "created",
      header: t("signWorkspace.created", "Created"),
      sortable: true,
      get: (item) => Date.parse(item.createdAt),
      format: (value) => new Date(value).toLocaleDateString(),
    }),
    column.number<SigningItem>({
      key: "due",
      header: t("signWorkspace.dueDate", "Due date"),
      sortable: true,
      get: (item) => (item.dueDate ? Date.parse(item.dueDate) : undefined),
      format: (value) => new Date(value).toLocaleDateString(),
      placeholder: t("signWorkspace.noDueDate", "No due date"),
    }),
  ];

  return (
    <div className="signing-workspace__content">
      <div className="signing-workspace__toolbar">
        <SegmentedControl
          value={tab}
          onChange={(value) => {
            setTab(value);
            filters.filterBar.onClearAll();
          }}
          options={[
            { value: "active", label: t("sharedSign.tab.active", "Active") },
            { value: "unread", label: t("signMenu.unreadTab", "Unread") },
            {
              value: "closed",
              label: t("signMenu.closedTab", "Closed"),
            },
          ]}
        />
        <Button
          variant="quiet"
          aria-label={t("signWorkspace.refresh", "Refresh sessions")}
          title={t("signWorkspace.refresh", "Refresh sessions")}
          onClick={onRefresh}
          disabled={loading}
          leftSection={<Icon name="refresh-cw" size={18} />}
        />
      </div>
      <DataTableFilterBar {...filters.filterBar} />
      <DataTable
        columns={columns}
        rows={filters.rows}
        rowKey={(item) => `${item.kind}:${item.sessionId}`}
        onRowClick={onOpen}
        rowAffordance="chevron"
        defaultSort={{ key: "created", direction: "desc" }}
        loading={loading && items.length === 0}
        empty={
          rows.length === 0
            ? tab === "unread"
              ? t("signMenu.noUnread", "You're all caught up")
              : t("signWorkspace.empty", "No sessions here yet.")
            : t(
                "signWorkspace.noMatches",
                "No sessions match your search or filter.",
              )
        }
      />
    </div>
  );
}
