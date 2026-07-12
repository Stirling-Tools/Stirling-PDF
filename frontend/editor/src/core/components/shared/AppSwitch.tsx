import { useTranslation } from "react-i18next";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { AppIcon, Button, Dropdown } from "@app/ui";
import markLight from "@app/assets/brand/modern-logo/StirlingPDFLogoNoTextLight.svg";
import markDark from "@app/assets/brand/modern-logo/StirlingPDFLogoNoTextDark.svg";
import "@app/components/shared/AppSwitch.css";

export type AppSwitchTarget = "editor" | "processor";

interface AppSwitchProps {
  /** The app this switcher is rendered in (shown as active in the menu). */
  current: AppSwitchTarget;
  /** Resolved color scheme; picks the brand mark for the menu items. */
  theme: "light" | "dark";
  /** Invoked with the selected app; only called for apps other than `current`. */
  onSwitch: (app: AppSwitchTarget) => void;
  className?: string;
}

/**
 * The editor ⇄ processor app switcher (chevron button → app menu). The editor
 * and portal sidebars render this same element so the two apps present one
 * identical switcher; each host supplies its own theme source and navigation.
 */
export function AppSwitch({
  current,
  theme,
  onSwitch,
  className,
}: AppSwitchProps) {
  const { t } = useTranslation();
  const mark = theme === "dark" ? markDark : markLight;
  const apps: Array<{ id: AppSwitchTarget; label: string }> = [
    {
      id: "processor",
      label: t("portal.shell.sidebar.appProcessor", "Processor"),
    },
    { id: "editor", label: t("portal.shell.sidebar.appEditor", "Editor") },
  ];
  return (
    <Dropdown.Root align="end" className={className}>
      <Dropdown.Trigger>
        <Button
          variant="tertiary"
          className="app-switch-btn"
          aria-label={t("portal.shell.sidebar.switchApp", "Switch app")}
        >
          <AppIcon mui={KeyboardArrowDownIcon} size={14} />
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Menu width="11rem">
        {apps.map((app) => (
          <Dropdown.Item
            key={app.id}
            active={current === app.id}
            onSelect={app.id === current ? undefined : () => onSwitch(app.id)}
            leading={<img className="app-switch-icon" src={mark} alt="" />}
          >
            {app.label}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
