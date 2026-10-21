import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { SidebarBase } from "@app/components/viewer/SidebarBase";
import type { ReadAloudStore } from "@app/components/viewer/useViewerReadAloud";
import { ReadAloudPlayer } from "@app/components/viewer/readAloud/ReadAloudPlayer";

interface ReadAloudSidebarProps {
  visible: boolean;
  /** Distance from the right edge, in rem, so the panel stacks beside the other sidebars. */
  rightOffset: number;
  store: ReadAloudStore;
  onOpen: () => void;
  onClose: () => void;
}

export function ReadAloudSidebar({
  visible,
  rightOffset,
  store,
  onOpen,
  onClose,
}: ReadAloudSidebarProps) {
  const { t } = useTranslation();
  const readAloud = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const previousPanelOpenRef = useRef(readAloud.panelOpen);
  const detectAgainLabel = t("readAloud.detectAgain", "Detect language again");

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

  return (
    <SidebarBase
      className="read-aloud-sidebar"
      title={t("readAloud.title", "Read aloud")}
      icon={<Icon name="volume-2" size={20} />}
      rightOffset={`${rightOffset}rem`}
      visible={visible}
      onClose={onClose}
      closeLabel={t("readAloud.closeSidebar", "Close read aloud")}
      headerActions={
        <Tooltip content={detectAgainLabel} position="top" delay={0}>
          <ActionIcon
            variant="tertiary"
            size="sm"
            aria-label={detectAgainLabel}
            title={detectAgainLabel}
            onClick={() => void readAloud.redetect()}
            disabled={readAloud.detectionStatus === "detecting"}
          >
            <Icon name="refresh-cw" size="0.9rem" />
          </ActionIcon>
        </Tooltip>
      }
    >
      <ReadAloudPlayer readAloud={readAloud} />
    </SidebarBase>
  );
}
