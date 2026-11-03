import { PortalProviders as CloudPortalProviders } from "@processor-cloud/PortalProviders";
import { PortalProviders as ServerPortalProviders } from "@processor-proprietary/PortalProviders";
import { editionComponent } from "@processor/edition";

/** Stirling Cloud has no account-link layer; a self-hosted server does. */
export const PortalProviders = editionComponent(
  CloudPortalProviders,
  ServerPortalProviders,
);
