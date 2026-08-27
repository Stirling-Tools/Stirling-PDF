import { useTranslation } from "react-i18next";
import { Dropdown } from "@app/ui";
import { BrandMark } from "@app/components/shared/BrandMark";

export type AppSwitchTarget = "editor" | "processor";

interface AppSwitchMenuItemsProps {
  /** The app this switcher is rendered in (shown as active in the menu). */
  current: AppSwitchTarget;
  /** Invoked with the selected app; only called for apps other than `current`. */
  onSwitch: (app: AppSwitchTarget) => void;
}

/**
 * The editor / processor items for an app-switch menu. The mark is the shared
 * <BrandMark>, which recolours itself from the theme tokens.
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
          leading={<BrandMark height="1.125rem" />}
        >
          {app.label}
        </Dropdown.Item>
      ))}
    </>
  );
}
