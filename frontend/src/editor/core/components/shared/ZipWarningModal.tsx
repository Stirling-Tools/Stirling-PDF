import { Modal, Text, Group, Stack } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { CSSProperties } from "react";

interface ZipWarningModalProps {
  opened: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  fileCount: number;
  zipFileName: string;
}

const WARNING_ICON_SIZE = 36;

const WARNING_ICON_STYLE: CSSProperties = {
  display: "block",
  margin: "0 auto 8px",
  color: "var(--c-accent-text)",
};

const ZipWarningModal = ({
  opened,
  onConfirm,
  onCancel,
  fileCount,
  zipFileName,
}: ZipWarningModalProps) => {
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
        <Icon
          name="triangle-alert"
          size={WARNING_ICON_SIZE}
          style={WARNING_ICON_STYLE}
        />
        <Text size="md" fw={300}>
          {zipFileName}
        </Text>
        <Text size="lg" fw={500}>
          {t("zipWarning.message", {
            count: fileCount,
            defaultValue: "This ZIP contains {{count}} files. Extract anyway?",
          })}
        </Text>
      </Stack>

      {/* Desktop layout: centered buttons */}
      <Group justify="center" gap="sm" visibleFrom="md">
        <Button
          variant="secondary"
          accent="neutral"
          onClick={onCancel}
          leftSection={<Icon name="circle-x" size={20} />}
          style={{
            width: "10rem",
          }}
        >
          {t("zipWarning.cancel", "Cancel")}
        </Button>
        <Button
          onClick={onConfirm}
          leftSection={<Icon name="circle-check" size={20} />}
          style={{
            width: "10rem",
          }}
        >
          {t("zipWarning.confirm", "Extract")}
        </Button>
      </Group>

      {/* Mobile layout: vertical stack */}
      <Stack align="center" gap="sm" hiddenFrom="md">
        <Button
          variant="secondary"
          accent="neutral"
          onClick={onCancel}
          leftSection={<Icon name="circle-x" size={20} />}
          style={{
            width: "10rem",
          }}
        >
          {t("zipWarning.cancel", "Cancel")}
        </Button>
        <Button
          onClick={onConfirm}
          leftSection={<Icon name="circle-check" size={20} />}
          style={{
            width: "10rem",
          }}
        >
          {t("zipWarning.confirm", "Extract")}
        </Button>
      </Stack>
    </Modal>
  );
};

export default ZipWarningModal;
