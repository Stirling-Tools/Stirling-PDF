import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import WorkbenchBar from "@app/components/shared/WorkbenchBar";
import { useTopBarSlot } from "@app/contexts/TopBarSlotContext";
import { useAllFiles } from "@app/contexts/FileContext";
import {
  useNavigationState,
  useNavigationActions,
} from "@app/contexts/NavigationContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useWorkbenchTakeover } from "@app/components/layout/WorkbenchTakeover";
import styles from "@app/components/shared/WorkbenchTopBar.module.css";

/**
 * Renders the workbench toolbar into the shell's full-width top bar (see
 * AppFrame / TopBarSlotContext) with a portal, so it spans the whole window
 * above the rail and sidebars while keeping its workbench contexts. Desktop
 * only: on mobile the toolbar stays in the workbench column (see Workbench).
 */
export function WorkbenchTopBar() {
  const slot = useTopBarSlot();
  const { files: activeFiles } = useAllFiles();
  const { workbench: currentView } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const { readerMode } = useToolWorkflow();
  const takeover = useWorkbenchTakeover();
  const { t } = useTranslation();

  // The viewer tool row can be retracted to give the document more height; the
  // reopen tab below the bar brings it back. Owned here so the tab can hang
  // outside the bar's overflow-clipped wrapper.
  const [viewerToolbarCollapsed, setViewerToolbarCollapsed] = useState(false);
  const showReopenTab = currentView === "viewer" && viewerToolbarCollapsed;

  // On the transition, so reading sets the toolbar's start state without locking it.
  const prevReaderModeRef = useRef(readerMode);
  useEffect(() => {
    if (readerMode !== prevReaderModeRef.current) {
      setViewerToolbarCollapsed(readerMode);
      prevReaderModeRef.current = readerMode;
    }
  }, [readerMode]);

  // A takeover owns the canvas and must finish, so it keeps the toolbar (which
  // navigates away) out of the bar.
  if (!slot || takeover) return null;

  return createPortal(
    <div className={styles.shell}>
      <div className={styles.wrapper}>
        <div className={styles.inner}>
          <WorkbenchBar
            currentView={currentView}
            setCurrentView={navActions.setWorkbench}
            hasFiles={activeFiles.length > 0}
            viewerToolbarCollapsed={viewerToolbarCollapsed}
            onCollapseViewerToolbar={setViewerToolbarCollapsed}
          />
        </div>
      </div>
      {showReopenTab && (
        <Button
          type="button"
          variant="quiet"
          className={styles.reopenTab}
          onClick={() => setViewerToolbarCollapsed(false)}
          aria-expanded={false}
          aria-label={t("workbenchBar.showToolbar", "Show toolbar")}
          title={t("workbenchBar.showToolbar", "Show toolbar")}
          leftSection={<Icon name="chevron-down" size={"1rem"} />}
        />
      )}
    </div>,
    slot,
  );
}
