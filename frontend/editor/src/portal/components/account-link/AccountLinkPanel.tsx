import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Skeleton } from "@app/ui";
import { AccountConnectionLayout } from "@app/components/settings/AccountConnectionLayout";
import { useAsync } from "@portal/hooks/useAsync";
import { useAccountLinkContext } from "@portal/contexts/AccountLinkContext";
import { HttpError } from "@portal/api/http";
import {
  fetchInstances,
  revokeInstance as apiRevokeInstance,
  type LinkedInstanceRow,
} from "@portal/api/link";
import { LinkAccountCard } from "@portal/components/account-link/LinkAccountCard";
import { LinkedInstancesTable } from "@portal/components/account-link/LinkedInstancesTable";
import "@portal/views/AccountLink.css";

/** Self-hosted connection status plus the owning team's connected instances. */
export function AccountLinkPanel() {
  const { t } = useTranslation();
  const link = useAccountLinkContext();

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
    <AccountConnectionLayout
      title={t("portal.settings.sections.account-link", "Account connection")}
      description={t(
        "portal.accountLink.panel.sub",
        "Manage this server’s connection to your Stirling Cloud account.",
      )}
    >
      <LinkAccountCard link={link} />

      {linked && (
        <section className="account-connection__body">
          <div className="portal-link__section-head">
            <h2 className="portal-link__section-title">
              {t(
                "portal.accountLink.panel.instancesTitle",
                "Connected instances",
              )}
            </h2>
            <p className="portal-link__section-sub">
              {t(
                "portal.accountLink.panel.instancesSub",
                "Self-hosted servers connected to the same team.",
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
                "portal.accountLink.panel.loadError.title",
                "Couldn’t load connected instances",
              )}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setReloadKey((key) => key + 1)}
                >
                  {t("settings.connectedInstances.retry", "Try again")}
                </Button>
              }
            >
              {instancesState.error instanceof HttpError &&
              instancesState.error.status === 403
                ? t(
                    "portal.accountLink.panel.loadError.forbidden",
                    "Only the team owner can manage connected instances.",
                  )
                : t(
                    "portal.accountLink.panel.loadError.generic",
                    "Your connections could not be checked. Try again.",
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
                "portal.accountLink.panel.revokeError",
                "Couldn't revoke instance",
              )}
            >
              {revokeError}
            </Banner>
          )}
        </section>
      )}
    </AccountConnectionLayout>
  );
}
