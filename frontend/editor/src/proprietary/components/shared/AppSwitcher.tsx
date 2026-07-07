import { Menu } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import CheckIcon from "@mui/icons-material/Check";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useAuth } from "@app/auth/context";
import { LogoIcon } from "@app/components/shared/LogoIcon";
import { PORTAL_BASENAME } from "@portal/contexts/ViewContext";

/**
 * Sidebar app switcher between the editor and the admin portal. Both are
 * route-sets of one SPA (the portal mounts at PORTAL_BASENAME), so switching
 * is a client-side navigation. Hidden for users without portal access — they
 * have nowhere to switch to. Mirrors the portal sidebar's switcher.
 */
export function AppSwitcher() {
  const { t } = useTranslation();
  const { portalAccess } = useAuth();
  const navigate = useNavigate();

  if (!portalAccess) return null;

  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <ActionIcon
          size="sm"
          variant="tertiary"
          aria-label={t("portal.shell.sidebar.switchApp", "Switch app")}
        >
          <KeyboardArrowDownIcon fontSize="small" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<LogoIcon width={16} height={16} />}
          rightSection={<CheckIcon fontSize="small" />}
        >
          {t("portal.shell.sidebar.appEditor", "Editor")}
        </Menu.Item>
        <Menu.Item
          leftSection={<LogoIcon width={16} height={16} />}
          onClick={() => navigate(PORTAL_BASENAME)}
        >
          {t("portal.shell.sidebar.appProcessor", "Processor")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
