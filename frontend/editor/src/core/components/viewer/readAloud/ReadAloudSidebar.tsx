import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { SidebarBase } from "@app/components/viewer/SidebarBase";
import type { ReadAloudStore } from "@app/components/viewer/useViewerReadAloud";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { ReadAloudPlayer } from "@app/components/viewer/readAloud/ReadAloudPlayer";
import { ReadAloudRail } from "@app/components/viewer/readAloud/ReadAloudRail";

interface ReadAloudSidebarProps {
  visible: boolean;
  collapsed: boolean;
  /** Distance from the right edge, in rem, so the panel stacks beside the other sidebars. */
  rightOffset: number;
  store: ReadAloudStore;
  onOpen: () => void;
  onClose: () => void;
  onCollapse: () => void;
  onExpand: () => void;
}

export function ReadAloudSidebar({
  visible,
  collapsed,
  rightOffset,
  store,
  onOpen,
  onClose,
  onCollapse,
  onExpand,
}: ReadAloudSidebarProps) {
  const { t } = useTranslation();
  const { setReaderMode } = useToolWorkflow();
  const readAloud = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const previousPanelOpenRef = useRef(readAloud.panelOpen);
  const collapseLabel = t("readAloud.collapse", "Collapse to mini player");

  useEffect(() => {
    if (visible) readAloud.openPanel();
    else readAloud.closePanel();
  }, [visible, readAloud.openPanel, readAloud.closePanel]);

  // "Read aloud from here" opens the player through the store, not the toolbar.
  // Mirror that transition into the sidebar so the control and panel agree.
  useEffect(() => {
    if (readAloud.panelOpen && !previousPanelOpenRef.current) onOpen();
    previousPanelOpenRef.current = readAloud.panelOpen;
  }, [readAloud.panelOpen, onOpen]);

  if (!visible) return null;

  const openReadMode = () => {
    setReaderMode(true);
    onCollapse();
  };

  if (collapsed) {
    return (
      <ReadAloudRail
        readAloud={readAloud}
        rightOffset={rightOffset}
        onExpand={onExpand}
        onClose={onClose}
      />
    );
  }

  return (
    <SidebarBase
      className="read-aloud-sidebar"
      title={t("readAloud.title", "Read aloud")}
      icon={<Icon name="volume-2" size={20} />}
      rightOffset={`${rightOffset}rem`}
      visible
      onClose={onClose}
      closeLabel={t("readAloud.close", "Close read aloud")}
      headerActions={
        <Tooltip content={collapseLabel} position="top" delay={0}>
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            size="sm"
            aria-label={collapseLabel}
            title={collapseLabel}
            onClick={onCollapse}
          >
            <Icon name="chevron-right" size="1rem" />
          </ActionIcon>
        </Tooltip>
      }
    >
      <ReadAloudPlayer readAloud={readAloud} onReadMode={openReadMode} />
    </SidebarBase>
  );
}
