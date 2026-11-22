import { memo, useEffect } from "react";
import { useEditorStoreView } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import { useEditorSelection } from "@editor/tools/pdfTextEditor/hooks/useEditorSelection";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import { useDeferredPanelView } from "@editor/tools/pdfTextEditor/hooks/useDeferredPanelView";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import { EditorTopBar } from "@editor/tools/pdfTextEditor/components/EditorTopBar";
import { MobileEditorTopBar } from "@editor/tools/pdfTextEditor/components/MobileEditorTopBar";
import { MobileActionBar } from "@editor/tools/pdfTextEditor/components/MobileActionBar";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import { FindBar } from "@editor/tools/pdfTextEditor/components/FindBar";
import { MarqueeSelector } from "@editor/tools/pdfTextEditor/components/MarqueeSelector";

/** The viewer's own controls float over the page area; pressing one is not a deselect. */
const CONTROLS =
  "button, input, select, textarea, a, [role='button'], [role='slider']";

/** The text editor's strip and find bar, docked above the viewer while editing. */
export function ViewerEditToolbar() {
  const { store, state } = useEditorStoreView();
  const selection = useEditorSelection(store);
  // Deferred so the typed letter is drawn before the bars, which a burst of typing outdates.
  const bars = useDeferredPanelView(state, selection);
  const isMobile = useIsMobile();

  // A plain press on the bare viewer around the pages clears the selection,
  // as one on bare page does. Shift extends, and Ctrl/Cmd+Shift starts the
  // marquee: neither may wipe what it is about to add to.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.shiftKey) return;
      const target = e.target as Element | null;
      if (!target?.closest("[data-viewer-pages]")) return;
      if (target.closest(`[data-page-index], ${CONTROLS}`)) return;
      store.selection.clear();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [store]);

  return (
    <>
      <TopBar
        store={store}
        state={bars.state}
        selection={bars.selection}
        mobile={isMobile}
      />
      {state.findOpen && state.hasDocument && (
        <FindBar
          store={store}
          pages={state.pages}
          onClose={() => store.setFindOpen(false)}
        />
      )}
      <MarqueeSelector store={store} />
    </>
  );
}

interface BarProps {
  store: EditorStore;
  state: EditorViewState;
  selection: SelectionState;
}

const TopBar = memo(function TopBar({
  store,
  state,
  selection,
  mobile,
}: BarProps & { mobile: boolean }) {
  const controller = useToolbarController(store, state, selection);
  if (mobile)
    return (
      <MobileEditorTopBar
        controller={controller}
        hasDocument={state.hasDocument}
        dirty={state.dirty}
      />
    );
  return (
    <EditorTopBar
      controller={controller}
      hasDocument={state.hasDocument}
      dirty={state.dirty}
      addTextArmed={state.mode === "addText"}
      addTableArmed={state.mode === "addTable"}
      onToggleAddTable={() => store.toggleMode("addTable")}
      onToggleAddText={() => store.toggleMode("addText")}
      findOpen={state.findOpen}
      onToggleFind={() => store.toggleFindOpen()}
      onShowHelp={() => store.setHelpOpen(true)}
    />
  );
});

/** The editing actions a small screen shows below the pages. */
export function ViewerEditActionBar() {
  const { store, state } = useEditorStoreView();
  const selection = useEditorSelection(store);
  const bars = useDeferredPanelView(state, selection);
  if (!state.hasDocument) return null;
  return (
    <ActionBar store={store} state={bars.state} selection={bars.selection} />
  );
}

const ActionBar = memo(function ActionBar({
  store,
  state,
  selection,
}: BarProps) {
  const controller = useToolbarController(store, state, selection);
  return (
    <MobileActionBar
      store={store}
      controller={controller}
      addTextArmed={state.mode === "addText"}
      addTableArmed={state.mode === "addTable"}
      findOpen={state.findOpen}
    />
  );
});
