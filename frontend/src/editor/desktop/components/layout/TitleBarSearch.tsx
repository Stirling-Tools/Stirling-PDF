import { createPortal } from "react-dom";
import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import { useEditorSearchScopes } from "@app/hooks/useSuperSearch";
import { useTitleBarStrip } from "@app/contexts/TitleBarStripContext";

/**
 * The single desktop Super Search instance, portalled into the title-bar strip.
 * Mounted in AppLayout so it stays across every editor view (reader, empty
 * homepage, takeover) - which is why the inline bar search, floating search and
 * reader search are all suppressed on desktop.
 */
export function TitleBarSearch() {
  const strip = useTitleBarStrip();
  const scopes = useEditorSearchScopes();
  if (!strip.searchSlot) return null;
  return createPortal(
    <div className="workbench-bar-search">
      <SuperSearch scopes={scopes} />
    </div>,
    strip.searchSlot,
  );
}
