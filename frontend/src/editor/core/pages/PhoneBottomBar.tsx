import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { SignMenu } from "@editor/components/shared/signing/SignMenu";
import { useQuickNavHost } from "@editor/contexts/QuickNavHostContext";
import { useOpenSigning } from "@editor/hooks/signing/useOpenSigning";
import type { ToolId } from "@editor/types/toolId";

/** What the phone bottom bar's buttons do; HomePage owns every transition. */
export interface PhoneNavigationProps {
  onShowTools: () => void;
  /** Null when automation is unavailable. */
  onShowAutomate: (() => void) | null;
  onShowFiles: () => void;
  onOpenSettings: () => void;
  /** A signing tool picked from the Sign menu. */
  onSelectSigningTool: (tool: ToolId) => void;
}

/** Sign button with its menu of signing tools and unread signing sessions. */
export function PhoneSignButton({
  onSelectTool,
}: {
  onSelectTool: (tool: ToolId) => void;
}) {
  const { t } = useTranslation();
  const quickNavHost = useQuickNavHost();
  const openSigning = useOpenSigning();
  const [opened, setOpened] = useState(false);
  const unread = quickNavHost?.signingBadge ?? 0;

  return (
    <SignMenu
      opened={opened}
      onClose={() => setOpened(false)}
      reasons={quickNavHost?.toolReasons ?? {}}
      items={quickNavHost?.signingItems ?? []}
      onOpenSigning={openSigning}
      onSelect={onSelectTool}
    >
      <Button
        variant="tertiary"
        className="mobile-bottom-button"
        aria-label={
          unread
            ? t(
                "signMenu.triggerUnreadCount",
                "Sign · {{count}} unread sessions",
                { count: unread },
              )
            : t("signMenu.title", "Sign")
        }
        onClick={() => setOpened((open) => !open)}
      >
        <Icon name="pen-tool" size="1.5rem" />
        {unread > 0 && (
          <span className="sign-menu__trigger-badge" aria-hidden>
            {unread}
          </span>
        )}
        <span className="mobile-bottom-button-label">
          {t("signMenu.title", "Sign")}
        </span>
      </Button>
    </SignMenu>
  );
}

export function PhoneBottomBar({
  onShowTools,
  onShowAutomate,
  onShowFiles,
  onOpenSettings,
  onSelectSigningTool,
}: PhoneNavigationProps) {
  const { t } = useTranslation();

  return (
    <div className="mobile-bottom-bar">
      <PhoneSignButton onSelectTool={onSelectSigningTool} />
      <Button
        variant="tertiary"
        className="mobile-bottom-button"
        aria-label={t("quickAccess.allTools", "Tools")}
        onClick={onShowTools}
      >
        <Icon name="layout-grid" size={"1.5rem"} />
        <span className="mobile-bottom-button-label">
          {t("quickAccess.allTools", "Tools")}
        </span>
      </Button>
      {onShowAutomate && (
        <Button
          variant="tertiary"
          className="mobile-bottom-button"
          aria-label={t("quickAccess.automate", "Automate")}
          onClick={onShowAutomate}
        >
          <Icon name="automate" size="1.5rem" />
          <span className="mobile-bottom-button-label">
            {t("quickAccess.automate", "Automate")}
          </span>
        </Button>
      )}
      <Button
        variant="tertiary"
        className="mobile-bottom-button"
        aria-label={t("home.mobile.openFiles", "Open files")}
        onClick={onShowFiles}
      >
        <Icon name="folder" size="1.5rem" />
        <span className="mobile-bottom-button-label">
          {t("quickAccess.files", "Files")}
        </span>
      </Button>
      <Button
        variant="tertiary"
        className="mobile-bottom-button"
        aria-label={t("quickAccess.config", "Config")}
        onClick={onOpenSettings}
      >
        <Icon name="settings" size="1.5rem" />
        <span className="mobile-bottom-button-label">
          {t("quickAccess.config", "Config")}
        </span>
      </Button>
    </div>
  );
}
