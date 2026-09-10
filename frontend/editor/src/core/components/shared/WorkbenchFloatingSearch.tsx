import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import { useEditorSearchScopes } from "@app/hooks/useSuperSearch";
import WorkbenchBarFileMenuToggle from "@app/components/shared/workbenchBar/WorkbenchBarFileMenuToggle";
import { useFileMenu } from "@app/contexts/FileMenuContext";
import "@app/components/shared/WorkbenchFloatingSearch.css";

// The editor's global search, floated while no file is open (mirrors the
// processor's PortalSearchBar). Renders only when the WorkbenchBar doesn't, so
// reusing the default input id is safe.
export default function WorkbenchFloatingSearch() {
  const scopes = useEditorSearchScopes();
  // The bar hosts the file menu's toggle; with no file open there is no bar, and
  // an empty workbench would otherwise have no way to bring the menu back.
  const fileMenu = useFileMenu();
  return (
    <div className="workbench-floating-search">
      {fileMenu?.hidden && (
        <div className="workbench-floating-search-lead">
          <WorkbenchBarFileMenuToggle onExpand={fileMenu.expand} />
        </div>
      )}
      <SuperSearch scopes={scopes} />
    </div>
  );
}
