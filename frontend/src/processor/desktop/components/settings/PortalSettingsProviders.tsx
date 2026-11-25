import { PortalSettingsProviders as CloudPortalSettingsProviders } from "@processor-cloud/components/settings/PortalSettingsProviders";
import { PortalSettingsProviders as ServerPortalSettingsProviders } from "@processor-proprietary/components/settings/PortalSettingsProviders";
import { editionComponent } from "@processor/edition";

/** Cloud settings use the signed-in account; a self-hosted server adds its
 *  instance-link layer. */
export const PortalSettingsProviders = editionComponent(
  CloudPortalSettingsProviders,
  ServerPortalSettingsProviders,
);
