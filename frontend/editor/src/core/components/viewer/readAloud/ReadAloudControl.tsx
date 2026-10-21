import { useSyncExternalStore } from "react";
import { Drawer, Popover } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { ReadAloudStore } from "@app/components/viewer/useViewerReadAloud";
import { useIsPhone } from "@app/hooks/useIsMobile";
import { Z_INDEX_VIEWER_FLOATING_MENU } from "@app/styles/zIndex";
import { ReadAloudPlayer } from "@app/components/viewer/readAloud/ReadAloudPlayer";

interface ReadAloudControlProps {
  store: ReadAloudStore;
  disabled?: boolean;
  position?: "top" | "bottom" | "left" | "right";
}

/**
 * The viewer's single read-aloud affordance.
 *
 * It lives in one component so the workbench bar and the reader rail render the
 * same button and the same panel; only one of the two is mounted in a given
 * layout. The phone sheet is the same player, not a reduced copy.
 */
export function ReadAloudControl({
  store,
  disabled = false,
  position = "bottom",
}: ReadAloudControlProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const readAloud = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const label = t("workbenchBar.readAloud", "Read aloud");
  const unsupported =
    typeof window === "undefined" || !("speechSynthesis" in window);

  const button = (
    <Tooltip
      content={label}
      position={position}
      arrow
      delay={0}
      disabled={readAloud.panelOpen}
      open={readAloud.panelOpen ? false : undefined}
      openOnFocus={false}
    >
      <ActionIcon
        variant={
          readAloud.panelOpen || readAloud.isReadingAloud
            ? "primary"
            : "tertiary"
        }
        className="workbench-bar-action-icon"
        disabled={disabled || unsupported}
        aria-label={label}
        aria-pressed={readAloud.panelOpen}
        onClick={readAloud.togglePanel}
      >
        <Icon name="volume-2" size="1rem" />
      </ActionIcon>
    </Tooltip>
  );

  if (isPhone) {
    return (
      <>
        {button}
        <Drawer
          opened={readAloud.panelOpen}
          onClose={readAloud.closePanel}
          position="bottom"
          size="auto"
          radius="lg"
          padding="md"
          trapFocus
          zIndex={Z_INDEX_VIEWER_FLOATING_MENU}
          styles={{
            content: { height: "auto", maxHeight: "85vh" },
            body: { paddingBottom: "env(safe-area-inset-bottom)" },
          }}
        >
          <ReadAloudPlayer readAloud={readAloud} />
        </Drawer>
      </>
    );
  }

  return (
    <Popover
      opened={readAloud.panelOpen}
      onChange={(open) => {
        if (open) readAloud.openPanel();
        else readAloud.closePanel();
      }}
      position={position}
      offset={8}
      withArrow
      shadow="md"
      width="auto"
      trapFocus
      closeOnClickOutside={!readAloud.isReadingAloud}
      withinPortal
    >
      <Popover.Target>
        <div style={{ display: "inline-flex" }}>{button}</div>
      </Popover.Target>
      <Popover.Dropdown p="sm">
        <ReadAloudPlayer readAloud={readAloud} />
      </Popover.Dropdown>
    </Popover>
  );
}
