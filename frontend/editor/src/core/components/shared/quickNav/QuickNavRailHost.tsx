import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
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
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { HAS_PORTAL } from "@app/routes/hasPortal";

import { Icon } from "@app/ui/Icon";
const SIZE = "1.125rem";

/** Entries come from the URL, not either app's context, so the rail survives a switch. */
export function QuickNavRailHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const host = useQuickNavHost();

  const appMounted = Boolean(host?.appMounted);

  const inPortal = pathname.startsWith(PORTAL_BASENAME);

  // Only the app knows its own default state.
  const returnHome = () => {
    const reset = host?.actions.current?.goToDefaultState;
    if (reset) reset();
    else navigate(inPortal ? PORTAL_BASENAME : EDITOR_BASENAME);
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
      icon: inPortal ? (
        <Icon name="cpu" size={SIZE} />
      ) : (
        <Icon name="cpu" size={SIZE} />
      ),
      current: inPortal,
      disabled: HAS_PORTAL && !inPortal && !host?.portalAccess,
      reason:
        HAS_PORTAL && !inPortal && !host?.portalAccess
          ? t("quickNav.noProcessorAccess", "Ask an admin for processor access")
          : undefined,
      onClick: () => {
        if (inPortal) {
          returnHome();
          return;
        }
        saveEditorReturnPath();
        go(PORTAL_BASENAME);
      },
    },
    {
      id: "editor",
      label: t("quickNav.editor", "Editor"),
      icon: inPortal ? (
        <Icon name="pencil" size={SIZE} />
      ) : (
        <Icon name="pencil" size={SIZE} />
      ),
      current: !inPortal,
      onClick: () => {
        if (!inPortal) {
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
      icon: <Icon name="folder" size={SIZE} />,
      onClick: () => go("/files"),
    },
    {
      id: "reader",
      label: t("quickNav.reader", "Reader"),
      icon: <Icon name="book-open" size={SIZE} />,
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
      icon: <Icon name="git-branch" size={SIZE} />,
      ...openingTool("automate"),
      ...unusable("automate"),
      onClick: () => openTool("automate", "/automate"),
    },
    {
      id: "sharedSign",
      label: t("home.sharedSign.title", "Shared Signing"),
      icon: <Icon name="pen-tool" size={SIZE} />,
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
      groups={HAS_PORTAL ? [apps, within] : [within]}
      onReturnHome={returnHome}
      identity={host?.identity ?? null}
      onOpenSettings={host?.hasSettings ? openSettings : undefined}
      onInvite={
        // Spelt out: VIEW_PATHS lives in the portal, which core cannot import.
        HAS_PORTAL && host?.portalAccess
          ? () => go(`${PORTAL_BASENAME}/users`)
          : undefined
      }
      onToggleNotifications={() =>
        host?.actions.current?.toggleNotifications?.()
      }
      notificationsOpen={host?.notificationsOpen}
    />
  );
}
