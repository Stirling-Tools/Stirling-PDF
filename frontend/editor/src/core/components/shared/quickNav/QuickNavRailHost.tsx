import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import LocalIcon from "@app/components/shared/LocalIcon";
import { QuickNavRailContainer } from "@app/components/shared/quickNav/QuickNavRailContainer";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";
import type { ToolId } from "@app/types/toolId";
import { useQuickNavHost } from "@app/contexts/QuickNavHostContext";
import { requestReaderMode } from "@app/utils/pendingReaderMode";
import {
  saveEditorReturnPath,
  takeEditorReturnPath,
} from "@app/services/workbenchSession";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { PROCESSOR_BASENAME } from "@app/routes/processorBasename";
import { HAS_PROCESSOR } from "@app/routes/hasProcessor";

const SIZE = "1.125rem";

/** Entries come from the URL, not either app's context, so the rail survives a switch. */
export function QuickNavRailHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const host = useQuickNavHost();

  const appMounted = Boolean(host?.appMounted);

  const inProcessor = pathname.startsWith(PROCESSOR_BASENAME);

  // Only the app knows its own default state.
  const returnHome = () => {
    const reset = host?.actions.current?.goToDefaultState;
    if (reset) reset();
    else navigate(inProcessor ? PROCESSOR_BASENAME : EDITOR_BASENAME);
  };

  // Guarded where the app supplies a guard, so leaving mid-edit still prompts.
  const go = (to: string) => {
    const guard = host?.actions.current?.requestNavigation;
    if (guard) guard(() => navigate(to));
    else navigate(to);
  };

  // Through the app where possible: its route only selects a tool on a fresh mount.
  const openTool = (toolId: ToolId, route: string) => {
    const select = host?.actions.current?.selectTool;
    if (select) select(toolId);
    else go(route);
  };

  const openingTool = (id: ToolId) => ({ current: host?.activeTool === id });

  const unusable = (id: ToolId) => {
    const reason = host?.toolReasons?.[id];
    return { disabled: Boolean(reason), reason };
  };

  const apps: QuickNavEntry[] = [
    {
      id: "processor",
      label: t("quickNav.processor", "Processor"),
      // Two literals, not a computed name: the offline icon bundle scans for `icon="..."`.
      icon: inProcessor ? (
        <LocalIcon icon="memory-rounded" width={SIZE} height={SIZE} />
      ) : (
        <LocalIcon icon="memory-outline-rounded" width={SIZE} height={SIZE} />
      ),
      current: inProcessor,
      disabled: HAS_PROCESSOR && !inProcessor && !host?.processorAccess,
      reason:
        HAS_PROCESSOR && !inProcessor && !host?.processorAccess
          ? t("quickNav.noProcessorAccess", "Ask an admin for processor access")
          : undefined,
      onClick: () => {
        if (inProcessor) {
          returnHome();
          return;
        }
        saveEditorReturnPath();
        go(PROCESSOR_BASENAME);
      },
    },
    {
      id: "editor",
      label: t("quickNav.editor", "Editor"),
      icon: inProcessor ? (
        <LocalIcon icon="edit-outline-rounded" width={SIZE} height={SIZE} />
      ) : (
        <LocalIcon icon="edit-rounded" width={SIZE} height={SIZE} />
      ),
      current: !inProcessor,
      onClick: () => {
        if (!inProcessor) {
          returnHome();
          return;
        }
        // Back to where you left the editor, not its front door.
        navigate(takeEditorReturnPath() ?? EDITOR_BASENAME);
      },
    },
  ];

  const within: QuickNavEntry[] = [
    {
      id: "files",
      label: t("fileSidebar.myFiles", "File library"),
      icon: (
        <LocalIcon icon="folder-outline-rounded" width={SIZE} height={SIZE} />
      ),
      onClick: () => go("/files"),
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
      pressed: Boolean(host?.readerMode),
      // From the processor there is no editor to toggle - see pendingReaderMode.
      onClick: () => {
        const setMode = host?.actions.current?.setReaderMode;
        if (setMode) {
          setMode(!host?.readerMode);
          return;
        }
        requestReaderMode();
        go(EDITOR_BASENAME);
      },
    },
    {
      id: "automate",
      label: t("quickAccess.automate", "Automate"),
      icon: (
        <LocalIcon icon="rebase-outline-rounded" width={SIZE} height={SIZE} />
      ),
      ...openingTool("automate"),
      ...unusable("automate"),
      onClick: () => openTool("automate", "/automate"),
    },
    {
      id: "sharedSign",
      label: t("home.sharedSign.title", "Shared Signing"),
      icon: (
        <LocalIcon icon="draw-outline-rounded" width={SIZE} height={SIZE} />
      ),
      badge: host?.signingBadge,
      badgeTone: "warning",
      ...openingTool("sharedSign"),
      ...unusable("sharedSign"),
      onClick: () => openTool("sharedSign", "/shared-sign"),
    },
  ];

  // Read at click time, so it's always the mounted app's.
  const openSettings = () => host?.actions.current?.openSettings?.();

  // A route that isn't the app hides the bar - see useSuppressQuickNavRail.
  if (!appMounted || host?.chromeless) return null;

  return (
    <QuickNavRailContainer
      groups={HAS_PROCESSOR ? [apps, within] : [within]}
      onReturnHome={returnHome}
      identity={host?.identity ?? null}
      onOpenSettings={host?.hasSettings ? openSettings : undefined}
      onInvite={
        // Spelt out: VIEW_PATHS lives in the processor, which core cannot import.
        HAS_PROCESSOR && host?.processorAccess
          ? () => go(`${PROCESSOR_BASENAME}/users`)
          : undefined
      }
      onToggleNotifications={() =>
        host?.actions.current?.toggleNotifications?.()
      }
      notificationsOpen={host?.notificationsOpen}
    />
  );
}
