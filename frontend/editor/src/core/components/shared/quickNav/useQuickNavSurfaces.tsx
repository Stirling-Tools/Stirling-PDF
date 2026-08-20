import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import LocalIcon from "@app/components/shared/LocalIcon";
import { BrandTile } from "@app/components/shared/BrandTile";
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
  const { handleToolSelect, handleBackToTools, readerMode } = useToolWorkflow();
  const { workbench } = useNavigationState();

  const inFiles = workbench === "myFiles";

  const apps: QuickNavEntry[] = [
    {
      id: "editor",
      label: t("quickNav.editor", "Editor"),
      // The Stirling app tile, matching the lockup beside the editor's name in
      // the processor's editor card - this entry switches apps, so it is branded
      // rather than carrying a feature glyph.
      icon: <BrandTile size={SIZE} />,
      kind: "destination",
      // Files and reader mode are both inside the editor app, so the app stays
      // current while you're in them - as the current app, not the current page,
      // which the entry for the place you're in claims. It also stays clickable:
      // My Files suppresses the workbench bar, making this the only way back out.
      isActive: true,
      currentKind: "app",
      onClick: () =>
        inFiles ? navigate(EDITOR_BASENAME) : handleBackToTools(),
    },
  ];

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
