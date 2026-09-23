import { Menu } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { StirlingFileStub } from "@app/types/fileContext";
import { useOpenInNewWindow } from "@app/extensions/openInNewWindow";

interface OpenInNewWindowMenuItemProps {
  file: StirlingFileStub;
  disabled?: boolean;
}

/**
 * Kebab menu item that opens a stored file in a separate window. Desktop-only:
 * the underlying extension is a no-op on web, so this renders nothing there
 * (and for any file that can't be opened in a new window).
 */
export function OpenInNewWindowMenuItem({
  file,
  disabled = false,
}: OpenInNewWindowMenuItemProps) {
  const { t } = useTranslation();
  const { canOpenInNewWindow, openInNewWindow } = useOpenInNewWindow();

  if (!canOpenInNewWindow(file)) return null;

  return (
    <Menu.Item
      disabled={disabled}
      leftSection={<Icon name="external-link" size={20} />}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) openInNewWindow(file);
      }}
    >
      {t("openInNewWindow", "Open in new window")}
    </Menu.Item>
  );
}
