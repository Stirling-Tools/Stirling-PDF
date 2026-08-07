import { Modal, Stack, Text, Group, List } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const lines = risks ? describeSaveRisks(risks) : [];
  return (
    <Modal
      opened={!!risks}
      onClose={onCancel}
      title={t("pdfTextEditorV2.saveRisk.title", "Saving will change this PDF")}
      size="md"
      data-testid="v2-save-risk-modal"
    >
      <Stack gap="md">
        <Text size="sm">
          {t(
            "pdfTextEditorV2.saveRisk.intro",
            "Downloading the edited copy rewrites the whole file. That means:",
          )}
        </Text>
        <List size="sm" spacing="xs">
          {lines.map((line) => (
            <List.Item key={line}>{line}</List.Item>
          ))}
        </List>
        <Text size="sm" c="dimmed">
          {t(
            "pdfTextEditorV2.saveRisk.note",
            "Your edits are kept. The changes listed above are unavoidable when downloading the edited copy.",
          )}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button
            variant="secondary"
            accent="neutral"
            onClick={onCancel}
            data-testid="v2-save-risk-cancel"
          >
            {t("pdfTextEditorV2.saveRisk.cancel", "Cancel")}
          </Button>
          <Button
            variant="primary"
            accent="danger"
            onClick={onConfirm}
            data-testid="v2-save-risk-confirm"
          >
            {t("pdfTextEditorV2.saveRisk.downloadAnyway", "Download anyway")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
