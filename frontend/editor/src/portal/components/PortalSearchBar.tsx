import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import { usePortalSearchResults } from "@portal/hooks/usePortalSearchResults";
import "@portal/components/PortalSearchBar.css";

/**
 * The portal face of the global super search — the same bar the editor's
 * workbench shows, fed by the portal-wired results provider. Cmd/Ctrl+K
 * focuses it (the bar registers its own shortcut). App config (the
 * admin/login gates) comes from PortalChrome's shared provider. The distinct
 * input id keeps this instance clear of the editor bar's stable id, which
 * external focus helpers target.
 */
export function PortalSearchBar() {
  return (
    <div className="portal-searchbar">
      <SuperSearch
        useResults={usePortalSearchResults}
        inputId="portal-search-input"
      />
    </div>
  );
}
