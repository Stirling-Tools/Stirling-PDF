import { Group, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";

interface Props {
  /** Name of the document that would be opened, or null when closed. */
  incomingFileName: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// Last stop before unsaved edits are thrown away. Opening a document disposes
// the one in memory, so the switcher and a canvas drop both come through here.
export function DiscardChangesModal({
  incomingFileName,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={incomingFileName !== null}
      onClose={onCancel}
      title={t("pdfTextEditor.discard.title", "Discard unsaved changes?")}
      size="md"
      data-testid="pdf-editor-discard-modal"
    >
      <Stack gap="md">
        <Text size="sm">
          {t(
            "pdfTextEditor.discard.body",
            "Opening {{name}} closes the document you are editing. Your unsaved changes will be lost.",
            { name: incomingFileName ?? "" },
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            "pdfTextEditor.discard.hint",
            "Cancel, then Save PDF to keep them in your workspace first.",
          )}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button
            variant="secondary"
            accent="neutral"
            onClick={onCancel}
            data-testid="pdf-editor-discard-cancel"
          >
            {t("pdfTextEditor.discard.cancel", "Cancel")}
          </Button>
          <Button
            variant="primary"
            accent="danger"
            onClick={onConfirm}
            data-testid="pdf-editor-discard-confirm"
          >
            {t("pdfTextEditor.discard.confirm", "Discard and open")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
