import { Modal, Text, Button, Stack, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface PolicyDeleteConfirmModalProps {
  opened: boolean;
  /** The policy's display label (the category name). */
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirm before deleting a policy — removing it discards its backing workflow. */
export function PolicyDeleteConfirmModal({
  opened,
  label,
  onConfirm,
  onCancel,
}: PolicyDeleteConfirmModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={t("policies.deleteConfirmTitle", "Delete {{label}} policy?", {
        label,
      })}
      centered
      size="sm"
    >
      <Stack gap="md">
        <Text size="sm">
          {t(
            "policies.deleteConfirmBody",
            "This removes the policy and its workflow. Documents already processed are not affected.",
          )}
        </Text>
        <Group gap="sm" justify="flex-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t("cancel", "Cancel")}
          </Button>
          <Button color="red" size="sm" onClick={onConfirm}>
            {t("delete", "Delete")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
