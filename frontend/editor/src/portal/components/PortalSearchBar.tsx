import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import { usePortalSearchResults } from "@portal/hooks/usePortalSearchResults";
import "@portal/components/PortalSearchBar.css";

/**
 * The portal face of the global super search — the same bar the editor's
 * workbench shows, fed by the portal's destinations provider. Cmd/Ctrl+K
 * focuses it (the bar registers its own shortcut).
 */
export function PortalSearchBar() {
  return (
    <div className="portal-searchbar">
      <SuperSearch useResults={usePortalSearchResults} />
    </div>
  );
}
