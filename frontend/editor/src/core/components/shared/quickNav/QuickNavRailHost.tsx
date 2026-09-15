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
import { DOCS_PATH, HAS_DOCS } from "@app/routes/docsRoute";
import { stripBasePath } from "@app/constants/app";
import { rememberSettingsOrigin } from "@app/utils/settingsNavigation";

import { Icon } from "@app/ui/Icon";
const SIZE = "1.125rem";

/** Entries come from the URL, not either app's context, so the rail survives a switch. */
/** Interpolated, not inlined: a literal "#acc…" reads as a hex colour to theme-lint. */
const ACCOUNT_ANCHOR = "account";

export function QuickNavRailHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const host = useQuickNavHost();

  const appMounted = Boolean(host?.appMounted);

  const path = stripBasePath(pathname);
  const inSettings = path.startsWith("/settings");
  const inDocs = path.startsWith(DOCS_PATH);
  const inPortal = path.startsWith(PORTAL_BASENAME);
  // Settings and the docs browser are pages in their own right, so neither app
  // is the current one while you are on them.
  const inEditor = !inPortal && !inSettings && !inDocs;

  // Only the app knows its own default state.
  const returnHome = () => {
    const reset = host?.actions.current?.goToDefaultState;
    if (reset) reset();
    else navigate(inPortal ? PORTAL_BASENAME : EDITOR_BASENAME);
  };

  // Guarded where the app supplies a guard, so leaving mid-edit still prompts.
  const guarded = (leave: () => void) => {
    const guard = host?.actions.current?.requestNavigation;
    if (guard) guard(leave);
    else leave();
  };

  const go = (to: string) => guarded(() => navigate(to));

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

  // The apps you switch between. Reader is a mode over the editor rather
  // than a place of its own, but it leads the group because it is where most
  // visits start.
  const reader: QuickNavEntry = {
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
  };

  const editor: QuickNavEntry = {
    id: "editor",
    label: t("quickNav.editor", "Editor"),
    icon: <Icon name="pencil" size={SIZE} filled={inEditor} />,
    // The library is a place of its own, not the editor with a different centre.
    current: inEditor && !host?.fileLibrary,
    onClick: () => {
      if (inEditor) {
        returnHome();
        return;
      }
      // Back to where you left the editor, not its front door.
      navigate(takeEditorReturnPath() ?? EDITOR_BASENAME);
    },
  };

  const processor: QuickNavEntry = {
    id: "processor",
    label: t("quickNav.processor", "Processor"),
    icon: <Icon name="cpu" size={SIZE} filled={inPortal} />,
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
      if (inEditor) saveEditorReturnPath();
      go(PORTAL_BASENAME);
    },
  };

  // The processor is additive: dropping the editor with it left a lone reader
  // toggle in builds without a portal, with no way back out of reader mode.
  const apps: QuickNavEntry[] = [
    reader,
    editor,
    ...(HAS_PORTAL ? [processor] : []),
  ];

  const within: QuickNavEntry[] = [
    {
      id: "files",
      label: t("fileSidebar.myFiles", "File library"),
      icon: <Icon name="folder" size={SIZE} />,
      current: Boolean(host?.fileLibrary),
      // Through the app where possible: the library is a view, not a route. From the
      // processor there is no editor to ask, so the path carries it and HomePage seeds
      // the view on arrival. Unwrapped: setting the view runs the app's own
      // unsaved-changes check, and asking twice leaves the second ask nowhere to
      // prompt.
      onClick: () => {
        const show = host?.actions.current?.showFileLibrary;
        // Unwrapped: setting the view runs the app's own unsaved-changes check, and
        // asking twice leaves the second ask with nowhere to prompt.
        if (show) show();
        else go("/files");
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

  // Reference material, not a workspace: it sits at the foot of the bar under a
  // question mark rather than competing with the apps for the top.
  const openDocs = HAS_DOCS ? () => go(DOCS_PATH) : undefined;

  // The avatar is the only way into settings now, so it lands on the account
  // section and the page's own nav carries the rest. Inside settings it is a
  // tab switch (replace); from an app it is a navigation.
  const openAccount = () => {
    const target = `/settings/general#${ACCOUNT_ANCHOR}`;
    if (inSettings) {
      navigate(target, { replace: true });
      return;
    }
    rememberSettingsOrigin();
    go(target);
  };

  // A route that isn't the app hides the bar - see useSuppressQuickNavRail.
  if (!appMounted || host?.chromeless) return null;

  return (
    <QuickNavRailContainer
      groups={[apps, within]}
      onReturnHome={returnHome}
      identity={host?.identity ?? null}
      onOpenAccount={openAccount}
      // The avatar stands for the whole page, not just its own section.
      accountActive={inSettings}
      onOpenDocs={openDocs}
      docsActive={inDocs}
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
