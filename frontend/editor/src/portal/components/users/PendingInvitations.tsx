import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Avatar, column, DataTable, type DataTableColumn } from "@app/ui";
import type { PendingInvitation } from "@portal/api/users";

interface PendingInvitationsProps {
  invitations: PendingInvitation[];
  /** Cancel a pending invite by its backend id. */
  onCancel: (invitation: PendingInvitation) => void;
}

/** Human "Expires in 3 days" from an ISO expiry; empty when absent, unparseable,
 *  or already past (the adapter filters expired invites, so no "expired" state). */
function expiryLabel(iso: string | undefined, t: TFunction): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts) || ts <= Date.now()) return "";
  const days = Math.round((ts - Date.now()) / 86400000);
  if (days === 0) return t("users.invites.expiresToday", "Expires today");
  return t("users.invites.expiresInDays", "Expires in {{count}} days", {
    count: days,
  });
}

/**
 * Invitations that have not produced an account yet: SaaS team invitations, or
 * self-hosted invite links. A single flat list (not a section - there's only ever
 * one) captioned with its title; each row shows who it is for and lets it be
 * revoked. A link with no bound address can be redeemed by whoever holds it, so
 * it is named as such rather than left blank.
 */
export function PendingInvitations({
  invitations,
  onCancel,
}: PendingInvitationsProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<PendingInvitation>[]>(
    () => [
      column.entity({
        key: "invitee",
        header: t("users.invites.columns.invitee", "Invitee"),
        icon: (inv) => (
          <Avatar name={inv.email || "#"} size="sm" tone="neutral" />
        ),
        primary: (inv) =>
          inv.email ||
          t("users.invites.anyoneWithLink", "Anyone with the link"),
        note: (inv) =>
          inv.invitedBy
            ? t("users.invites.by", "Invited by {{who}}", {
                who: inv.invitedBy,
              })
            : undefined,
      }),
      column.muted({
        key: "expires",
        header: t("users.invites.columns.expires", "Expires"),
        get: (inv) => expiryLabel(inv.expiresAt, t),
      }),
      column.actions({
        key: "actions",
        get: (inv) => [
          {
            label: t("users.invites.cancel", "Revoke"),
            onClick: () => onCancel(inv),
          },
        ],
      }),
    ],
    [t, onCancel],
  );

  return (
    <DataTable<PendingInvitation>
      columns={columns}
      rows={invitations}
      rowKey={(inv) => String(inv.id)}
      caption={t("users.invites.title", "Pending invitations")}
    />
  );
}
