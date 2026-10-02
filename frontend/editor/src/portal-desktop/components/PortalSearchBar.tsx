import { createPortal } from "react-dom";
import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import { useTitleBarStrip } from "@app/contexts/TitleBarStripContext";
import { PortalSearchBar as InlineSearchBar } from "@portal-proprietary/components/PortalSearchBar";
import {
  usePortalSearchResults,
  usePortalSearchScopes,
} from "@portal/hooks/usePortalSearchResults";

/**
 * In the title-bar strip, where the editor keeps its search, so the Processor
 * has no second search row. The editor's own strip search stands aside on
 * Processor pages.
 */
export function PortalSearchBar() {
  const strip = useTitleBarStrip();
  const scopes = usePortalSearchScopes();
  if (!strip.searchSlot) return <InlineSearchBar />;
  return createPortal(
    <div className="workbench-bar-search">
      <SuperSearch
        useResults={usePortalSearchResults}
        inputId="portal-search-input"
        scopes={scopes}
        dropdownClassName="portal-search-dropdown"
      />
    </div>,
    strip.searchSlot,
  );
}
