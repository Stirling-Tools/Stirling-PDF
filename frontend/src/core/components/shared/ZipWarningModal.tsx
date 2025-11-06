import { Modal, Text, Button, Group, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelIcon from "@mui/icons-material/Cancel";

interface ZipWarningModalProps {
  opened: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  fileCount: number;
  zipFileName: string;
}

const ZipWarningModal = ({ opened, onConfirm, onCancel, fileCount, zipFileName }: ZipWarningModalProps) => {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={t("zipWarning.title", "Large ZIP File")}
      centered
      size="sm"
      closeOnClickOutside={false}
      closeOnEscape={true}
    >
      <Stack gap="md">
        <Stack gap="xs" align="center">
          <WarningAmberIcon style={{ fontSize: '48px', color: 'var(--mantine-color-orange-6)' }} />
          <Text size="sm" fw={500} ta="center">
            {zipFileName}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {t("zipWarning.message", {
              count: fileCount,
              defaultValue: "This ZIP contains {{count}} files. Extract anyway?"
            })}
          </Text>
        </Stack>

        <Group justify="center" gap="md">
          <Button 
            variant="light" 
            color="gray" 
            onClick={onCancel}
            leftSection={<CancelIcon fontSize="small" />}
          >
            {t("zipWarning.cancel", "Cancel")}
          </Button>
          <Button 
            variant="filled" 
            color="orange"
            onClick={onConfirm}
            leftSection={<CheckCircleOutlineIcon fontSize="small" />}
          >
            {t("zipWarning.confirm", "Extract")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ZipWarningModal;
