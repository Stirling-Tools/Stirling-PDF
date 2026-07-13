import { useTranslation } from "react-i18next";
import { Avatar, Button } from "@app/ui";
import type { PendingInvitation } from "@portal/api/users";
import "@portal/views/Users.css";

interface PendingInvitationsProps {
  invitations: PendingInvitation[];
  /** Cancel a pending invite by its backend id. */
  onCancel: (invitation: PendingInvitation) => void;
}

/** Human "Expires in 3 days" from an ISO expiry; empty when absent, unparseable,
 *  or already past (the adapter filters expired invites, so no "expired" state). */
function expiryLabel(iso: string | undefined, expiresWord: string): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts) || ts <= Date.now()) return "";
  const days = Math.round((ts - Date.now()) / 86400000);
  if (days === 0) return `${expiresWord} today`;
  return `${expiresWord} in ${days === 1 ? "1 day" : `${days} days`}`;
}

/**
 * Pending team invitations (SaaS): the parity gap vs the editor. Each row shows
 * the invitee and lets a team leader cancel the invite. Rendered only when the
 * flavor supports it (manageInvitations) and there are pending invites.
 */
export function PendingInvitations({
  invitations,
  onCancel,
}: PendingInvitationsProps) {
  const { t } = useTranslation();
  const expiresWord = t("users.invites.expires", "Expires");
  return (
    <section className="portal-users__group">
      <header className="portal-users__group-head">
        <div className="portal-users__group-title">
          <strong>{t("users.invites.title", "Pending invitations")}</strong>
          <span className="portal-users__group-desc">
            {t(
              "users.invites.desc",
              "Invited people who haven't joined yet. They hold a seat until they accept.",
            )}
          </span>
        </div>
        <span className="portal-users__group-count">
          {t("users.invites.count", "{{count}} pending", {
            count: invitations.length,
          })}
        </span>
      </header>
      {invitations.map((inv) => {
        const expires = expiryLabel(inv.expiresAt, expiresWord);
        return (
          <div className="portal-users__row" key={inv.id}>
            <div className="portal-users__row-main">
              <Avatar name={inv.email} size="sm" tone="neutral" />
              <div className="portal-users__row-id">
                <span className="portal-users__row-name">{inv.email}</span>
                {inv.invitedBy && (
                  <span className="portal-users__row-email">
                    {t("users.invites.by", "Invited by {{who}}", {
                      who: inv.invitedBy,
                    })}
                  </span>
                )}
              </div>
            </div>
            <span className="portal-users__inv-spacer" />
            {expires && (
              <span className="portal-users__row-active">{expires}</span>
            )}
            <Button variant="secondary" size="sm" onClick={() => onCancel(inv)}>
              {t("users.invites.cancel", "Cancel")}
            </Button>
          </div>
        );
      })}
    </section>
  );
}
