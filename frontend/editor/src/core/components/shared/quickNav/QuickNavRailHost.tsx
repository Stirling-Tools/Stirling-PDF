import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import LocalIcon from "@app/components/shared/LocalIcon";
import { QuickNavRailContainer } from "@app/components/shared/quickNav/QuickNavRailContainer";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";
import { useQuickNavHost } from "@app/contexts/QuickNavHostContext";
import { requestReaderMode } from "@app/utils/pendingReaderMode";
import {
  saveEditorReturnPath,
  takeEditorReturnPath,
} from "@app/services/workbenchSession";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { HAS_PORTAL } from "@app/routes/adminRouteExtensions";

const SIZE = "1.125rem";

/**
 * The quick nav rail, assembled above the route split.
 *
 * Every destination here is a route, so the entries and their current states
 * come from the URL rather than from either app's context - which is what lets
 * this render once, outside both, and stay mounted while they swap underneath.
 * The few things it can't derive that way (who you are, the signing count,
 * whether you may open the processor, how to open settings) are registered by
 * whichever app is mounted; see QuickNavHostContext.
 */
export function QuickNavRailHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const host = useQuickNavHost();

  // Nothing has mounted under the frame yet - login, an error state, or no
  // backend to reach - so there is no app for this bar to navigate.
  const appMounted = Boolean(host?.appMounted);

  const inPortal = pathname.startsWith(PORTAL_BASENAME);

  // Guarded where the editor offered a guard: leaving it mid-edit should still
  // prompt. The processor registers none, and then this is a plain navigation.
  const go = (to: string) => {
    const guard = host?.actions.current?.requestNavigation;
    if (guard) guard(() => navigate(to));
    else navigate(to);
  };

  // A tool is opened through the app that owns it where possible; navigating to
  // its route only selects it on a fresh mount, which is what the other app gets.
  const openTool = (toolId: string, route: string) => {
    const select = host?.actions.current?.selectTool;
    if (select) select(toolId);
    else go(route);
  };

  // Drawn as usable unless the mounted app says otherwise. RailButton keeps a
  // disabled entry rendered and focusable, with the reason as its tooltip, so the
  // slot never moves and the explanation is reachable by keyboard.
  const unusable = (id: string) => {
    const reason = host?.toolReasons?.[id];
    return { disabled: Boolean(reason), reason };
  };

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
      // In the editor this toggles the mode. From the processor the editor isn't
      // mounted to be toggled, so the intent is left for it to pick up as it
      // arrives - see pendingReaderMode.
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

  // Whether to draw these comes from state; the handler itself is read at click
  // time, so it is always the mounted app's.
  const call = (name: "openSettings" | "openTeams") => () =>
    host?.actions.current?.[name]?.();

  // A chrome-less route (the login form, an invite, a shared link) hides the bar
  // even though an app has mounted in this tab - see useSuppressQuickNavRail.
  if (!appMounted || host?.chromeless) return null;

  return (
    <QuickNavRailContainer
      groups={[within]}
      appSwitch={{
        currentApp: inPortal ? "processor" : "editor",
        otherApp: HAS_PORTAL
          ? inPortal
            ? {
                // Back to wherever you left the editor, not to its front door:
                // the processor is somewhere you step out to and come back from.
                onOpen: () =>
                  navigate(takeEditorReturnPath() ?? EDITOR_BASENAME),
              }
            : {
                disabled: !host?.portalAccess,
                reason: !host?.portalAccess
                  ? t(
                      "quickNav.noProcessorAccess",
                      "Ask an admin for processor access",
                    )
                  : undefined,
                onOpen: () => {
                  saveEditorReturnPath(pathname + search);
                  go(PORTAL_BASENAME);
                },
              }
          : undefined,
        // Clicking the mark of the app you are in returns it to its default
        // state. Only that app knows what that is, so it does the work; with
        // none mounted, navigating to its home is the closest equivalent.
        onReturnHome: () => {
          const reset = host?.actions.current?.goToDefaultState;
          if (reset) reset();
          else navigate(inPortal ? PORTAL_BASENAME : EDITOR_BASENAME);
        },
      }}
      identity={host?.identity ?? null}
      // Rendered whenever an app has registered a handler; between apps there is
      // briefly none, and the control simply doesn't respond for that moment
      // rather than disappearing and shifting everything above it.
      onOpenSettings={host?.hasSettings ? call("openSettings") : undefined}
      onOpenTeams={host?.hasTeams ? call("openTeams") : undefined}
      onToggleNotifications={() =>
        host?.actions.current?.toggleNotifications?.()
      }
    />
  );
}
