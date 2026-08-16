import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Avatar, Button } from "@app/ui";
import type { PendingInvitation } from "@processor/api/users";
import "@processor/theme/surface.css";
import "@processor/views/Users.css";

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
 * Pending team invitations (SaaS): the parity gap vs the editor. Each row shows
 * the invitee and lets a team leader cancel the invite. Rendered only when the
 * flavor supports it (manageInvitations) and there are pending invites.
 */
export function PendingInvitations({
  invitations,
  onCancel,
}: PendingInvitationsProps) {
  const { t } = useTranslation();
  return (
    <section className="processor-surface processor-users__group">
      <header className="processor-users__group-head">
        <div className="processor-users__group-title">
          <strong>{t("users.invites.title", "Pending invitations")}</strong>
          <span className="processor-users__group-desc">
            {t(
              "users.invites.desc",
              "Invited people who haven't joined yet. They hold a seat until they accept.",
            )}
          </span>
        </div>
        <span className="processor-users__group-count">
          {t("users.invites.count", "{{count}} pending", {
            count: invitations.length,
          })}
        </span>
      </header>
      {invitations.map((inv) => {
        const expires = expiryLabel(inv.expiresAt, t);
        return (
          <div className="processor-users__row" key={inv.id}>
            <div className="processor-users__row-main">
              <Avatar name={inv.email} size="sm" tone="neutral" />
              <div className="processor-users__row-id">
                <span className="processor-users__row-name">{inv.email}</span>
                {inv.invitedBy && (
                  <span className="processor-users__row-email">
                    {t("users.invites.by", "Invited by {{who}}", {
                      who: inv.invitedBy,
                    })}
                  </span>
                )}
              </div>
            </div>
            <span className="processor-users__inv-spacer" />
            {expires && (
              <span className="processor-users__row-active">{expires}</span>
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
