import { PortalProviders as CloudPortalProviders } from "@portal-cloud/PortalProviders";
import { PortalProviders as ServerPortalProviders } from "@portal-proprietary/PortalProviders";
import { editionComponent } from "@portal/edition";

/** Stirling Cloud has no account-link layer; a self-hosted server does. */
export const PortalProviders = editionComponent(
  CloudPortalProviders,
  ServerPortalProviders,
);
