import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import { usePortalSearchResults } from "@portal/hooks/usePortalSearchResults";
import "@portal/components/PortalSearchBar.css";

/**
 * The portal face of the global super search — the same bar the editor's
 * workbench shows, fed by the portal-wired results provider. Cmd/Ctrl+K
 * focuses it (the bar registers its own shortcut). The config provider
 * supplies the admin/login gates the settings and Processor sources share
 * with the editor bar.
 */
export function PortalSearchBar() {
  return (
    <AppConfigProvider bootstrapMode="non-blocking">
      <div className="portal-searchbar">
        <SuperSearch useResults={usePortalSearchResults} />
      </div>
    </AppConfigProvider>
  );
}
