import { useTranslation } from "react-i18next";
import { Button, Dropdown } from "@app/ui";
import { BrandMark } from "@app/components/shared/BrandMark";
import "@app/components/shared/AppSwitch.css";

export type AppSwitchTarget = "editor" | "processor";

function ChevronDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

interface AppSwitchMenuItemsProps {
  /** The app this switcher is rendered in (shown as active in the menu). */
  current: AppSwitchTarget;
  /** Invoked with the selected app; only called for apps other than `current`. */
  onSwitch: (app: AppSwitchTarget) => void;
}

/**
 * The editor / processor items for the app-switch menu. Shared so the chevron
 * switcher (below) and the BrandSwitcher's logo trigger present the same list.
 * The mark is the shared <BrandMark>, which recolours itself from the theme
 * tokens, so no colour-scheme prop needs threading down here.
 */
export function AppSwitchMenuItems({
  current,
  onSwitch,
}: AppSwitchMenuItemsProps) {
  const { t } = useTranslation();
  const apps: Array<{ id: AppSwitchTarget; label: string }> = [
    {
      id: "processor",
      label: t("portal.shell.sidebar.appProcessor", "Processor"),
    },
    { id: "editor", label: t("portal.shell.sidebar.appEditor", "Editor") },
  ];
  return (
    <>
      {apps.map((app) => (
        <Dropdown.Item
          key={app.id}
          active={current === app.id}
          onSelect={app.id === current ? undefined : () => onSwitch(app.id)}
          leading={<BrandMark className="app-switch-icon" height="1.125rem" />}
        >
          {app.label}
        </Dropdown.Item>
      ))}
    </>
  );
}

interface AppSwitchProps {
  /** The app this switcher is rendered in (shown as active in the menu). */
  current: AppSwitchTarget;
  /** Invoked with the selected app; only called for apps other than `current`. */
  onSwitch: (app: AppSwitchTarget) => void;
  className?: string;
}

/**
 * The editor ⇄ processor app switcher (chevron button → app menu). The editor
 * and portal sidebars render this same element so the two apps present one
 * identical switcher; each host supplies its own navigation.
 */
export function AppSwitch({ current, onSwitch, className }: AppSwitchProps) {
  const { t } = useTranslation();
  return (
    <Dropdown.Root align="end" className={className}>
      <Dropdown.Trigger>
        <Button
          variant="tertiary"
          className="app-switch-btn"
          aria-label={t("portal.shell.sidebar.switchApp", "Switch app")}
        >
          <ChevronDownIcon />
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Menu width="11rem">
        <AppSwitchMenuItems current={current} onSwitch={onSwitch} />
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
