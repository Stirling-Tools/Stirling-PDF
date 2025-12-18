import { Modal, Text, Button, Group, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { CSSProperties } from "react";

interface ZipWarningModalProps {
  opened: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  fileCount: number;
  zipFileName: string;
}

const WARNING_ICON_STYLE: CSSProperties = {
  fontSize: 36,
  display: 'block',
  margin: '0 auto 8px',
  color: 'var(--mantine-color-blue-6)'
};

const ZipWarningModal = ({ opened, onConfirm, onCancel, fileCount, zipFileName }: ZipWarningModalProps) => {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={t("zipWarning.title", "Large ZIP File")}
      centered
      size="auto"
      closeOnClickOutside={true}
      closeOnEscape={true}
    >
      <Stack ta="center" p="md" gap="sm">
        <LocalIcon icon="warning-rounded" width={48} height={48} style={WARNING_ICON_STYLE} />
        <Text size="md" fw={300}>
          {zipFileName}
        </Text>
        <Text size="lg" fw={500}>
          {t("zipWarning.message", {
            count: fileCount,
            defaultValue: "This ZIP contains {{count}} files. Extract anyway?"
          })}
        </Text>
      </Stack>

      {/* Desktop layout: centered buttons */}
      <Group justify="center" gap="sm" visibleFrom="md">
        <Button
          variant="light"
          color="var(--mantine-color-gray-8)"
          onClick={onCancel}
          leftSection={<LocalIcon icon="cancel-rounded" width={20} height={20} />}
          w="10rem"
        >
          {t("zipWarning.cancel", "Cancel")}
        </Button>
        <Button
          variant="filled"
          color="var(--mantine-color-blue-9)"
          onClick={onConfirm}
          leftSection={<LocalIcon icon="check-circle-outline-rounded" width={20} height={20} />}
          w="10rem"
        >
          {t("zipWarning.confirm", "Extract")}
        </Button>
      </Group>

      {/* Mobile layout: vertical stack */}
      <Stack align="center" gap="sm" hiddenFrom="md">
        <Button
          variant="light"
          color="var(--mantine-color-gray-8)"
          onClick={onCancel}
          leftSection={<LocalIcon icon="cancel-rounded" width={20} height={20} />}
          w="10rem"
        >
          {t("zipWarning.cancel", "Cancel")}
        </Button>
        <Button
          variant="filled"
          color="var(--mantine-color-blue-9)"
          onClick={onConfirm}
          leftSection={<LocalIcon icon="check-circle-outline-rounded" width={20} height={20} />}
          w="10rem"
        >
          {t("zipWarning.confirm", "Extract")}
        </Button>
      </Stack>
    </Modal>
  );
};

export default ZipWarningModal;
