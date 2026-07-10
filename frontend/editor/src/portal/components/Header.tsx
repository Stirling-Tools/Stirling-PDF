import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui";
import { useTheme } from "@portal/contexts/ThemeContext";
import "@portal/components/Header.css";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  return (
    <ActionIcon
      type="button"
      variant="quiet"
      className="portal-header__icon-btn"
      onClick={toggle}
      aria-label={
        theme === "light"
          ? t("portal.shell.header.switchToDark")
          : t("portal.shell.header.switchToLight")
      }
      title={
        theme === "light"
          ? t("portal.shell.header.darkMode")
          : t("portal.shell.header.lightMode")
      }
    >
      {theme === "light" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
    </ActionIcon>
  );
}

export function Header() {
  return (
    <header className="portal-header">
      <div className="portal-header__right">
        <ThemeToggle />
      </div>
    </header>
  );
}
