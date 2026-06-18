import { Modal, Stack, Text, Group, Button, List } from "@mantine/core";
import {
  describeSaveRisks,
  type SaveRisks,
} from "@app/tools/pdfTextEditor/v2/util/documentRisks";

interface SaveRiskModalProps {
  /** Non-null opens the modal; null keeps it closed. */
  risks: SaveRisks | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Warns before a save that would damage signatures / XFA. Saving re-writes
 * the whole file, so those can't survive - the user decides whether to
 * download the edited copy anyway.
 */
export function SaveRiskModal({
  risks,
  onConfirm,
  onCancel,
}: SaveRiskModalProps) {
  const lines = risks ? describeSaveRisks(risks) : [];
  return (
    <Modal
      opened={!!risks}
      onClose={onCancel}
      title="Saving will change this PDF"
      size="md"
      data-testid="v2-save-risk-modal"
    >
      <Stack gap="md">
        <Text size="sm">
          Downloading the edited copy rewrites the whole file. That means:
        </Text>
        <List size="sm" spacing="xs">
          {lines.map((line) => (
            <List.Item key={line}>{line}</List.Item>
          ))}
        </List>
        <Text size="sm" c="dimmed">
          Your edits are kept - only the items above are affected.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            onClick={onCancel}
            data-testid="v2-save-risk-cancel"
          >
            Cancel
          </Button>
          <Button
            color="red"
            onClick={onConfirm}
            data-testid="v2-save-risk-confirm"
          >
            Download anyway
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
