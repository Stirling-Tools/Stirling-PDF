import { PortalSettingsProviders as CloudPortalSettingsProviders } from "@portal-cloud/components/settings/PortalSettingsProviders";
import { PortalSettingsProviders as ServerPortalSettingsProviders } from "@portal-proprietary/components/settings/PortalSettingsProviders";
import { editionComponent } from "@portal/edition";

/** Cloud settings use the signed-in account; a self-hosted server adds its
 *  instance-link layer. */
export const PortalSettingsProviders = editionComponent(
  CloudPortalSettingsProviders,
  ServerPortalSettingsProviders,
);
