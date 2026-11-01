import SuperSearch from "@editor/components/shared/superSearch/SuperSearch";
import { useEditorSearchScopes } from "@editor/hooks/useSuperSearch";
import "@editor/components/shared/WorkbenchFloatingSearch.css";

// The editor's global search, floated while no file is open (mirrors the
// processor's PortalSearchBar). Renders only when the WorkbenchBar doesn't, so
// reusing the default input id is safe.
export default function WorkbenchFloatingSearch() {
  const scopes = useEditorSearchScopes();
  return (
    <div className="workbench-floating-search">
      <SuperSearch scopes={scopes} />
    </div>
  );
}
