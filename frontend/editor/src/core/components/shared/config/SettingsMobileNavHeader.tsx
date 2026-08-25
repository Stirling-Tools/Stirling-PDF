import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import LocalIcon from "@app/components/shared/LocalIcon";

interface SettingsMobileNavHeaderProps {
  /** Mobile shows nav and content as separate panes, so the nav needs its own header. */
  show: boolean;
  onClose: () => void;
  background: string;
  borderColor: string;
}

/** Header for the settings nav pane: the modal title plus a close button. */
export function SettingsMobileNavHeader({
  show,
  onClose,
  background,
  borderColor,
}: SettingsMobileNavHeaderProps) {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <div
      className="modal-header modal-nav-header"
      style={{ background, borderBottom: `1px solid ${borderColor}` }}
    >
      <Text fw={700} size="lg">
        {t("settings.title", "Settings")}
      </Text>
      <ActionIcon
        variant="tertiary"
        onClick={onClose}
        aria-label={t("settings.close", "Close")}
      >
        <LocalIcon icon="close-rounded" width={18} height={18} />
      </ActionIcon>
    </div>
  );
}

export default SettingsMobileNavHeader;
