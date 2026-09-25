import { Suspense, lazy, type ComponentType } from "react";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { useEnterpriseEnabled } from "@portal/hooks/useEnterpriseEnabled";
import { PortalSettingsSectionHost } from "@portal/components/settings/PortalSettingsSectionHost";
import { PortalRosterHost } from "@portal/components/settings/PortalRosterHost";
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

/** The roster's own host: it reads the tier and nothing else (see PortalRosterHost). */
function rosterHosted(View: ComponentType) {
  return function HostedRosterSection() {
    return (
      <PortalRosterHost>
        <Suspense fallback={<LoadingFallback />}>
          <View />
        </Suspense>
      </PortalRosterHost>
    );
  };
}

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

/** The processor's server administration as settings sections, each a portal view
 *  in its host. All but the roster are gated on the build shipping the processor. */
export const PortalUsersSection = rosterHosted(Users);
export const PortalApiKeysSection = hosted(ApiKeys, { padded: true });
export const PortalAuditSection = hosted(Audit, { padded: true });
export const PortalEncryptionSection = hosted(Encryption, { padded: true });
export const PortalBillingSection = hosted(Billing);

/** Self-hosted only: on SaaS the signed-in account IS the account, so there is
 *  no instance to link and the seam is null. */
export const PortalAccountLinkSection: ComponentType | null =
  accountLinkSettings ? hosted(accountLinkSettings.Body) : null;
