import { Button, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface SettingsStickyFooterProps {
  isDirty: boolean;
  saving: boolean;
  loginEnabled: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

export function SettingsStickyFooter({
  isDirty,
  saving,
  loginEnabled,
  onSave,
  onDiscard,
}: SettingsStickyFooterProps) {
  const { t } = useTranslation();

  if (!isDirty || !loginEnabled) {
    return null;
  }

  return (
    <div className="settings-sticky-footer">
      <Group justify="space-between" w="100%">
        <Text size="sm" c="dimmed">
          {t("admin.settings.unsavedChanges.hint", "You have unsaved changes")}
        </Text>
        <Group gap="sm">
          <Button variant="default" onClick={onDiscard} size="sm">
            {t("admin.settings.discard", "Discard")}
          </Button>
          <Button onClick={onSave} loading={saving} size="sm">
            {t("admin.settings.save", "Save Changes")}
          </Button>
        </Group>
      </Group>
    </div>
  );
}
