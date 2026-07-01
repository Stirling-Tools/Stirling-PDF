import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Skeleton, StatusBadge } from "@shared/components";
import { useAsync } from "@portal/hooks/useAsync";
import { useAccountLinkContext } from "@portal/contexts/AccountLinkContext";
import { useLink, LINK_INFO } from "@portal/contexts/LinkContext";
import { HttpError } from "@portal/api/http";
import {
  fetchInstances,
  revokeInstance as apiRevokeInstance,
  type LinkedInstanceRow,
} from "@portal/api/link";
import { LinkAccountCard } from "@portal/components/account-link/LinkAccountCard";
import { LinkedInstancesTable } from "@portal/components/account-link/LinkedInstancesTable";
import "@portal/views/AccountLink.css";

/**
 * Account-link surface rendered inside the Settings modal (Admin group). Same
 * content as the former /account-link view: the LinkAccountCard for THIS
 * instance + the team-wide LinkedInstancesTable. Lives inline so admins find it
 * intentionally rather than via a top-level sidebar nav entry.
 */
export function AccountLinkPanel() {
  const { t } = useTranslation();
  const link = useAccountLinkContext();
  const { linkState } = useLink();

  const linked = link.status?.linked ?? false;
  const [reloadKey, setReloadKey] = useState(0);
  // Only fetch the team-wide instance list when THIS instance is linked. When
  // unlinked, the portal has no team to display — the admin's SaaS session may
  // still be valid in the browser, but the local instance isn't part of a team
  // (so showing the team's other instances would be confusing).
  const instancesState = useAsync<LinkedInstanceRow[]>(
    () => (linked ? fetchInstances() : Promise.resolve([])),
    [reloadKey, linked],
  );

  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const revoke = useCallback(async (instance: LinkedInstanceRow) => {
    setRevokingId(instance.instanceId);
    setRevokeError(null);
    try {
      await apiRevokeInstance(instance.instanceId);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokingId(null);
    }
  }, []);

  return (
    <div className="portal-link portal-link--in-settings">
      <header className="portal-link__header">
        <div>
          <p className="portal-link__page-sub">
            {t(
              "accountLink.panel.sub",
              "Link this self-hosted org to its Stirling account so unattended processing bills against your org wallet.",
            )}
          </p>
        </div>
        <StatusBadge
          tone={
            linkState === "linked-subscribed"
              ? "success"
              : linkState === "linked-free"
                ? "info"
                : "neutral"
          }
          size="md"
        >
          {t(LINK_INFO[linkState].labelKey, LINK_INFO[linkState].labelDefault)}
        </StatusBadge>
      </header>

      <LinkAccountCard link={link} />

      {linked && (
        <section className="portal-link__instances">
          <div className="portal-link__section-head">
            <h2 className="portal-link__section-title">
              {t("accountLink.panel.instancesTitle", "Linked instances")}
            </h2>
            <p className="portal-link__section-sub">
              {t(
                "accountLink.panel.instancesSub",
                "Every self-hosted instance registered to this org. Revoke a credential to immediately cut off its unattended access.",
              )}
            </p>
          </div>
          {instancesState.loading ? (
            <div className="portal-link__skeleton" aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height="3rem" />
              ))}
            </div>
          ) : instancesState.error ? (
            <Banner
              tone="danger"
              title={t(
                "accountLink.panel.loadError.title",
                "Couldn't load linked instances",
              )}
            >
              {instancesState.error instanceof HttpError &&
              instancesState.error.status === 403
                ? t(
                    "accountLink.panel.loadError.forbidden",
                    "Only the team owner can view the org's linked instances.",
                  )
                : t(
                    "accountLink.panel.loadError.generic",
                    "Couldn't load the team's linked instances. Try again in a moment.",
                  )}
            </Banner>
          ) : (
            <LinkedInstancesTable
              instances={instancesState.data ?? []}
              onRevoke={revoke}
              revokingId={revokingId}
            />
          )}

          {revokeError && (
            <Banner
              tone="danger"
              title={t(
                "accountLink.panel.revokeError",
                "Couldn't revoke instance",
              )}
            >
              {revokeError}
            </Banner>
          )}
        </section>
      )}
    </div>
  );
}
