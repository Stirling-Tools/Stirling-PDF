import { Modal, Stack, Text, Group, List } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import {
  describeSaveRisks,
  type SaveRisks,
} from "@app/tools/pdfTextEditor/util/documentRisks";

interface SaveRiskModalProps {
  /** Non-null opens the modal; null keeps it closed. */
  risks: SaveRisks | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Warns before a save that would damage signatures / XFA. */
export function SaveRiskModal({
  risks,
  onConfirm,
  onCancel,
}: SaveRiskModalProps) {
  const { t } = useTranslation();
  const lines = risks ? describeSaveRisks(risks) : [];
  return (
    <Modal
      opened={!!risks}
      onClose={onCancel}
      title={t("pdfTextEditor.saveRisk.title", "Saving will change this PDF")}
      size="md"
      data-testid="pdf-editor-save-risk-modal"
    >
      <Stack gap="md">
        <Text size="sm">
          {t(
            "pdfTextEditor.saveRisk.intro",
            "Saving the edited copy changes the file. That means:",
          )}
        </Text>
        <List size="sm" spacing="xs">
          {lines.map((line) => (
            <List.Item key={line}>{line}</List.Item>
          ))}
        </List>
        <Text size="sm" c="dimmed">
          {t(
            "pdfTextEditor.saveRisk.note",
            "Your edits are kept. The changes listed above are unavoidable when saving the edited copy.",
          )}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button
            variant="secondary"
            accent="neutral"
            onClick={onCancel}
            data-testid="pdf-editor-save-risk-cancel"
          >
            {t("pdfTextEditor.saveRisk.cancel", "Cancel")}
          </Button>
          <Button
            variant="primary"
            accent="danger"
            onClick={onConfirm}
            data-testid="pdf-editor-save-risk-confirm"
          >
            {t("pdfTextEditor.saveRisk.saveAnyway", "Save anyway")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
