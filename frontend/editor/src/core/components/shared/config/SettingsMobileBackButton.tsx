import { useTranslation } from "react-i18next";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { ActionIcon } from "@app/ui/ActionIcon";

interface SettingsMobileBackButtonProps {
  /** Only the mobile two-pane layout has a nav pane to go back to. */
  show: boolean;
  onClick: () => void;
}

/** Returns the settings modal from a section back to the section list. */
export function SettingsMobileBackButton({
  show,
  onClick,
}: SettingsMobileBackButtonProps) {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <ActionIcon
      variant="tertiary"
      onClick={onClick}
      aria-label={t("settings.backToSections", "All settings")}
    >
      <ArrowBackRoundedIcon sx={{ fontSize: "1.25rem" }} />
    </ActionIcon>
  );
}

export default SettingsMobileBackButton;
