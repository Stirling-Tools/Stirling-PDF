import { useTranslation } from "react-i18next";
import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import { usePortalSearchResults } from "@portal/hooks/usePortalSearchResults";
import "@portal/components/PortalSearchBar.css";

/**
 * The portal face of the global super search — the same bar the editor's
 * workbench shows, fed by the portal's destinations provider. Cmd/Ctrl+K
 * focuses it (the bar registers its own shortcut).
 */
export function PortalSearchBar() {
  const { t } = useTranslation();
  return (
    <div className="portal-searchbar">
      <SuperSearch
        useResults={usePortalSearchResults}
        placeholder={t("portal.search.placeholder", "Search Stirling")}
        hint={t("portal.search.hint", "Type to jump to any portal page")}
        inputId="portal-search-input"
      />
    </div>
  );
}
