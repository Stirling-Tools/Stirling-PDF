import { Menu } from "@mantine/core";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useTranslation } from "react-i18next";
import { StirlingFileStub } from "@app/types/fileContext";
import { useOpenInNewWindow } from "@app/extensions/openInNewWindow";

interface OpenInNewWindowMenuItemProps {
  file: StirlingFileStub;
}

/**
 * Kebab menu item that opens a stored file in a separate window. Desktop-only:
 * the underlying extension is a no-op on web, so this renders nothing there
 * (and for any file that can't be opened in a new window).
 */
export function OpenInNewWindowMenuItem({
  file,
}: OpenInNewWindowMenuItemProps) {
  const { t } = useTranslation();
  const { canOpenInNewWindow, openInNewWindow } = useOpenInNewWindow();

  if (!canOpenInNewWindow(file)) return null;

  return (
    <Menu.Item
      leftSection={<OpenInNewIcon fontSize="small" />}
      onClick={(e) => {
        e.stopPropagation();
        openInNewWindow(file);
      }}
    >
      {t("openInNewWindow", "Open in new window")}
    </Menu.Item>
  );
}
