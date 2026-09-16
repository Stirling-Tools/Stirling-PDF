import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, InfoTooltip, Skeleton } from "@app/ui";
import { Icon } from "@app/ui/Icon";
import { AccountConnectionLayout } from "@app/components/settings/AccountConnectionLayout";
import { useAsync } from "@processor/hooks/useAsync";
import { useAccountLinkContext } from "@processor/contexts/AccountLinkContext";
import { HttpError } from "@processor/api/http";
import {
  fetchInstances,
  revokeInstance as apiRevokeInstance,
  type LinkedInstanceRow,
} from "@processor/api/link";
import { LinkAccountCard } from "@processor/components/account-link/LinkAccountCard";
import { LinkedInstancesTable } from "@processor/components/account-link/LinkedInstancesTable";
import "@processor/views/AccountLink.css";

/** Self-hosted connection status plus the owning team's connected instances. */
export function AccountLinkPanel() {
  const { t } = useTranslation();
  const link = useAccountLinkContext();

  const linked = link.status?.linked ?? false;
  const [reloadKey, setReloadKey] = useState(0);
  // Only fetch the team-wide instance list when THIS instance is linked. When
  // unlinked, the processor has no team to display — the admin's SaaS session may
  // still be valid in the browser, but the local instance isn't part of a team
  // (so showing the team's other instances would be confusing).
  const instancesState = useAsync<LinkedInstanceRow[]>(
    () => (linked ? fetchInstances() : Promise.resolve([])),
    [reloadKey, linked],
  );

  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const deviceId = link.status?.deviceId;
  const currentInstance = deviceId
    ? instancesState.data?.find((instance) => instance.deviceId === deviceId)
    : undefined;
  const otherInstances = (instancesState.data ?? []).filter(
    (instance) => !deviceId || instance.deviceId !== deviceId,
  );
  const cloudBaseUrl = import.meta.env.VITE_SAAS_FRONTEND_URL?.replace(
    /\/+$/,
    "",
  );
  const cloudSettingsUrl = cloudBaseUrl
    ? `${cloudBaseUrl}/settings/account-link`
    : null;

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
      title={t(
        "processor.settings.sections.account-link",
        "Account connection",
      )}
      description={t(
        "processor.accountLink.panel.sub",
        "Manage this server’s connection to your Stirling Cloud account.",
      )}
      actions={
        cloudSettingsUrl && (
          <Button
            fat
            as="a"
            href={cloudSettingsUrl}
            target="_blank"
            rel="noopener noreferrer"
            rightSection={<Icon name="external-link" size={20} />}
          >
            {t(
              "processor.accountLink.panel.manageCloud",
              "Manage on stirling.com",
            )}
          </Button>
        )
      }
    >
      <LinkAccountCard link={link} instanceName={currentInstance?.name} />

      {linked && (
        <section className="account-connection__body">
          <div className="processor-link__section-head">
            <h2 className="processor-link__section-title">
              {t(
                deviceId
                  ? "processor.accountLink.panel.otherInstancesTitle"
                  : "processor.accountLink.panel.instancesTitle",
                deviceId ? "Other connected instances" : "Connected instances",
              )}
            </h2>
            <InfoTooltip
              label={t(
                deviceId
                  ? "processor.accountLink.panel.otherInstancesSub"
                  : "processor.accountLink.panel.instancesSub",
                deviceId
                  ? "Other self-hosted servers connected to the same team in Stirling Cloud."
                  : "Self-hosted servers connected to the same team.",
              )}
            />
          </div>
          {instancesState.loading ? (
            <div className="processor-link__skeleton" aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height="3rem" />
              ))}
            </div>
          ) : instancesState.error ? (
            <Banner
              tone="danger"
              title={t(
                "processor.accountLink.panel.loadError.title",
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
                    "processor.accountLink.panel.loadError.forbidden",
                    "Only the team owner can manage connected instances.",
                  )
                : t(
                    "processor.accountLink.panel.loadError.generic",
                    "Your connections could not be checked. Try again.",
                  )}
            </Banner>
          ) : (
            <LinkedInstancesTable
              instances={otherInstances}
              excludingCurrent={Boolean(deviceId)}
              onRevoke={revoke}
              revokingId={revokingId}
            />
          )}

          {revokeError && (
            <Banner
              tone="danger"
              title={t(
                "processor.accountLink.panel.revokeError",
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
