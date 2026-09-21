import { createPortal } from "react-dom";
import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import { useEditorSearchScopes } from "@app/hooks/useSuperSearch";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useTitleBarStrip } from "@app/contexts/TitleBarStripContext";

// Reader hides the top bar on web; the desktop strip is Super Search's only home,
// so it stays visible by default. Flip to false to leave just the window controls
// up there while reading.
const SHOW_SEARCH_IN_READER = true;

/**
 * The single desktop Super Search instance, portalled into the title-bar strip.
 * Mounted in AppLayout so it survives every editor view (reader, empty homepage,
 * takeover) - which is why the inline bar search, floating search and reader
 * search are all suppressed on desktop.
 */
export function TitleBarSearch() {
  const strip = useTitleBarStrip();
  const scopes = useEditorSearchScopes();
  const { readerMode } = useToolWorkflow();
  const showSearch = SHOW_SEARCH_IN_READER || !readerMode;
  if (!strip.searchSlot || !showSearch) return null;
  return createPortal(
    <div className="workbench-bar-search">
      <SuperSearch scopes={scopes} />
    </div>,
    strip.searchSlot,
  );
}
