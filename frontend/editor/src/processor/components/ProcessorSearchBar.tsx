import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import {
  useProcessorSearchResults,
  usePortalSearchScopes,
} from "@processor/hooks/useProcessorSearchResults";
import "@processor/components/ProcessorSearchBar.css";

/**
 * The portal face of the global super search — the same bar the editor's
 * workbench shows, fed by the portal-wired results provider. Cmd/Ctrl+K
 * focuses it (the bar registers its own shortcut). App config (the
 * admin/login gates) comes from PortalChrome's shared provider. The distinct
 * input id keeps this instance clear of the editor bar's stable id, which
 * external focus helpers target.
 */
export function ProcessorSearchBar() {
  const scopes = usePortalSearchScopes();

  return (
    <div className="processor-searchbar">
      <SuperSearch
        useResults={useProcessorSearchResults}
        inputId="processor-search-input"
        scopes={scopes}
        dropdownClassName="processor-search-dropdown"
      />
    </div>
  );
}
