import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";

interface SettingsNavChevronProps {
  /** Mobile nav items drill into a second pane, so they get an affordance. */
  show: boolean;
}

/** Drill-in affordance on a settings nav item. */
export function SettingsNavChevron({ show }: SettingsNavChevronProps) {
  if (!show) return null;

  return (
    <ChevronRightRoundedIcon
      className="modal-nav-chevron"
      sx={{ fontSize: "1.25rem" }}
    />
  );
}

export default SettingsNavChevron;
