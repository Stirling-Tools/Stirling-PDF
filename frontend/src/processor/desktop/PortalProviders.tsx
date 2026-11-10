import { PortalProviders as CloudPortalProviders } from "@processor-cloud/PortalProviders";
import { PortalProviders as ServerPortalProviders } from "@processor-proprietary/PortalProviders";
import { PortalAppConfigProvider } from "@processor/contexts/PortalAppConfigProvider";
import { editionComponent } from "@processor/edition";

/** Stirling Cloud has no account-link layer; a self-hosted server does. */
const EditionPortalProviders = editionComponent(
  CloudPortalProviders,
  ServerPortalProviders,
);

/**
 * The edition's stack under the connected server's app config. The platform's
 * config describes the bundled backend, which is not the server the Processor
 * runs on. Inside PortalFrame, so the config is cached per connection.
 */
export function PortalProviders() {
  return (
    <PortalAppConfigProvider>
      <EditionPortalProviders />
    </PortalAppConfigProvider>
  );
}
