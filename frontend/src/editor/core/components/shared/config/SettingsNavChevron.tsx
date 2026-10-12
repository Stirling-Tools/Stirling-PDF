import { Icon } from "@app/ui/Icon";
interface SettingsNavChevronProps {
  /** Mobile nav items drill into a second pane, so they get an affordance. */
  show: boolean;
}

/** Drill-in affordance on a settings nav item. */
export function SettingsNavChevron({ show }: SettingsNavChevronProps) {
  if (!show) return null;

  return (
    <Icon name="chevron-right" size={"1.25rem"} className="modal-nav-chevron" />
  );
}

export default SettingsNavChevron;
