import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import LocalIcon from "@app/components/shared/LocalIcon";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";

const SIZE = "1.125rem";

/**
 * The editor's own rail entries, split into the two groups the bar renders:
 * `apps` are the core landing zones, `within` are the places and actions inside
 * the one you're in.
 *
 * Shared by every build variant so they can't disagree about behaviour; each
 * variant adds its own Processor entry to `apps` (core and desktop ship no
 * portal to switch to).
 */
export function useQuickNavSurfaces(): {
  apps: QuickNavEntry[];
  within: QuickNavEntry[];
} {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { handleToolSelect, readerMode } = useToolWorkflow();
  const { workbench } = useNavigationState();

  const inFiles = workbench === "myFiles";

  // Empty: the switcher holds only the apps you are NOT in, and the editor's own
  // mark is the brand above the bar. Builds that ship the processor add it here.
  const apps: QuickNavEntry[] = [];

  const within: QuickNavEntry[] = [
    {
      id: "files",
      label: t("fileSidebar.myFiles", "My Files"),
      icon: (
        <LocalIcon icon="folder-outline-rounded" width={SIZE} height={SIZE} />
      ),
      kind: "destination",
      isActive: inFiles,
      onClick: () => navigate("/files"),
    },
    {
      id: "reader",
      label: t("quickNav.reader", "Reader"),
      icon: (
        <LocalIcon
          icon="menu-book-outline-rounded"
          width={SIZE}
          height={SIZE}
        />
      ),
      kind: "destination",
      isActive: readerMode && !inFiles,
      // Not handleReaderToggle: that only flips the readerMode boolean, so from
      // the file/page editor or My Files the icon would appear to do nothing.
      // handleToolSelect("read") also moves to the viewer and selects the tool.
      onClick: () => handleToolSelect("read"),
    },
  ];

  return { apps, within };
}
