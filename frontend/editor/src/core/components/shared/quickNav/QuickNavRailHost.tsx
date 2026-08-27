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
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { HAS_PORTAL } from "@app/routes/hasPortal";

const SIZE = "1.125rem";

/**
 * Assembled above the route split: entries come from the URL rather than either app's
 * context, which is what lets this stay mounted while they swap. The rest is
 * registered - see QuickNavHostContext.
 */
export function QuickNavRailHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const host = useQuickNavHost();

  const appMounted = Boolean(host?.appMounted);

  const inPortal = pathname.startsWith(PORTAL_BASENAME);

  // Only the app knows its own default state.
  const returnHome = () => {
    const reset = host?.actions.current?.goToDefaultState;
    if (reset) reset();
    else navigate(inPortal ? PORTAL_BASENAME : EDITOR_BASENAME);
  };

  // Guarded where the app offered a guard, so leaving mid-edit still prompts.
  const go = (to: string) => {
    const guard = host?.actions.current?.requestNavigation;
    if (guard) guard(() => navigate(to));
    else navigate(to);
  };

  // Through the owning app where possible: its route only selects on a fresh mount.
  const openTool = (toolId: ToolId, route: string) => {
    const select = host?.actions.current?.selectTool;
    if (select) select(toolId);
    else go(route);
  };

  const unusable = (id: ToolId) => {
    const reason = host?.toolReasons?.[id];
    return { disabled: Boolean(reason), reason };
  };

  // Chip and pen, in the rail's own icon style: the app you are in carries an edge
  // bar rather than being inferred from a brand mark that swapped places.
  const apps: QuickNavEntry[] = [
    {
      id: "processor",
      label: t("quickNav.processor", "Processor"),
      icon: (
        <LocalIcon icon="memory-outline-rounded" width={SIZE} height={SIZE} />
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
        saveEditorReturnPath(pathname + search);
        go(PORTAL_BASENAME);
      },
    },
    {
      id: "editor",
      label: t("quickNav.editor", "Editor"),
      icon: (
        <LocalIcon icon="edit-outline-rounded" width={SIZE} height={SIZE} />
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
      label: t("fileSidebar.myFiles", "My Files"),
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
      ...unusable("sharedSign"),
      onClick: () => openTool("sharedSign", "/shared-sign"),
    },
  ];

  // Read at click time, so it's always the mounted app's.
  const call = (name: "openSettings" | "openTeams") => () =>
    host?.actions.current?.[name]?.();

  // A route that isn't the app hides the bar - see useSuppressQuickNavRail.
  if (!appMounted || host?.chromeless) return null;

  return (
    <QuickNavRailContainer
      groups={HAS_PORTAL ? [apps, within] : [within]}
      onReturnHome={returnHome}
      identity={host?.identity ?? null}
      // Between apps there is briefly no handler; the control stays put.
      onOpenSettings={host?.hasSettings ? call("openSettings") : undefined}
      onOpenTeams={host?.hasTeams ? call("openTeams") : undefined}
      onToggleNotifications={() =>
        host?.actions.current?.toggleNotifications?.()
      }
      notificationsOpen={host?.notificationsOpen}
    />
  );
}
