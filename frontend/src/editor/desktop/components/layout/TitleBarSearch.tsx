import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import SuperSearch from "@editor/components/shared/superSearch/SuperSearch";
import { useEditorSearchScopes } from "@editor/hooks/useSuperSearch";
import { useTitleBarStrip } from "@editor/contexts/TitleBarStripContext";
import { stripBasePath } from "@editor/constants/app";
import { isPortalPath } from "@editor/routes/portalBasename";

/**
 * The single desktop Super Search instance, portalled into the title-bar strip.
 * Mounted in AppLayout so it stays across every editor view (reader, empty
 * homepage, takeover) - which is why the inline bar search, floating search and
 * reader search are all suppressed on desktop. The Processor puts its own
 * search in the slot on its pages.
 */
export function TitleBarSearch() {
  const strip = useTitleBarStrip();
  const scopes = useEditorSearchScopes();
  const { pathname } = useLocation();
  if (!strip.searchSlot) return null;
  if (isPortalPath(stripBasePath(pathname))) return null;
  return createPortal(
    <div className="workbench-bar-search">
      <SuperSearch scopes={scopes} />
    </div>,
    strip.searchSlot,
  );
}
