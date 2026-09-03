import { Suspense, lazy, type ComponentType } from "react";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { useEnterpriseEnabled } from "@portal/hooks/useEnterpriseEnabled";
import { PortalSettingsSectionHost } from "@portal/components/settings/PortalSettingsSectionHost";
import { accountLinkSettings } from "@portal/components/settings/accountLinkSettings";

const Users = lazy(async () => {
  const m = await import("@portal/views/Users");
  return { default: m.Users };
});

const ApiKeys = lazy(async () => {
  const m = await import("@portal/components/infrastructure/ApiKeysTab");
  return { default: m.ApiKeysTab };
});

const Audit = lazy(async () => {
  const m = await import("@portal/components/infrastructure/AuditTab");
  return { default: m.AuditTab };
});

const EncryptionPanel = lazy(async () => {
  const m = await import("@portal/components/infrastructure/EncryptionPanel");
  return { default: m.EncryptionPanel };
});

/** Treat "still resolving" as available: flashing "your licence records no audit
 *  trail" at an Enterprise operator is worse than the notice arriving a beat late. */
function Encryption() {
  const enterprise = useEnterpriseEnabled();
  return (
    <EncryptionPanel
      auditAvailable={enterprise.loading || enterprise.enabled}
    />
  );
}

const Billing = lazy(async () => {
  const m = await import("@portal/components/settings/BillingSettingsSection");
  return { default: m.BillingSettingsSection };
});

/** `padded`: for views that were tab panels and left the page gutter to their host. */
function hosted(View: ComponentType, { padded = false } = {}) {
  return function HostedPortalSection() {
    return (
      <PortalSettingsSectionHost>
        <Suspense fallback={<LoadingFallback />}>
          {padded ? (
            <div className="portal-settings-section__padded">
              <View />
            </div>
          ) : (
            <View />
          )}
        </Suspense>
      </PortalSettingsSectionHost>
    );
  };
}

/**
 * The processor's server administration as settings sections: the org roster,
 * API keys and audit, and the account's billing. They configure the whole
 * deployment rather than a step in a document pipeline, so they belong on the
 * settings page and the processor keeps only its workflow.
 *
 * Each is a portal-authored view wrapped in {@link PortalSettingsSectionHost}
 * for the contexts it expects. The nav entries that mount these (labels, keys,
 * aliases) live in the proprietary layer, so a build without the processor
 * never pulls this module - and with it the portal chunk - into its graph.
 */
export const PortalUsersSection = hosted(Users);
export const PortalApiKeysSection = hosted(ApiKeys, { padded: true });
export const PortalAuditSection = hosted(Audit, { padded: true });
export const PortalEncryptionSection = hosted(Encryption, { padded: true });
export const PortalBillingSection = hosted(Billing);

/** Self-hosted only: on SaaS the signed-in account IS the account, so there is
 *  no instance to link and the seam is null. */
export const PortalAccountLinkSection: ComponentType | null =
  accountLinkSettings ? hosted(accountLinkSettings.Body) : null;
