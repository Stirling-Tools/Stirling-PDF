import { useEffect, useState } from "react";
import { Group, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { useViewerPageTool } from "@editor/contexts/viewer/ViewerPageTool";
import { useEditorStoreView } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import {
  reviewMode,
  useReviewMode,
} from "@editor/tools/pdfTextEditor/store/reviewMode";

/**
 * Answers a request to close the review. Under another tool closing unmounts the
 * editor, so unsaved tags are saved or discarded first.
 */
export function CloseReviewPrompt() {
  const { t } = useTranslation();
  const { closeRequested } = useReviewMode();
  const { state } = useEditorStoreView();
  const { selectedTool } = useNavigationState();
  const pageTool = useViewerPageTool();
  const [saving, setSaving] = useState(false);
  const mustAsk =
    closeRequested && state.dirty && selectedTool !== "pdfTextEditor";

  useEffect(() => {
    if (closeRequested && !mustAsk) reviewMode.close();
  }, [closeRequested, mustAsk]);

  const save = async () => {
    setSaving(true);
    try {
      await pageTool?.onSave?.();
      reviewMode.close();
    } catch {
      // The editor reports why; the prompt stays so the user can choose again.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={mustAsk}
      onClose={() => reviewMode.set({ closeRequested: false })}
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
      title={t("pdfTextEditor.review.closePrompt.title", "Save your tags?")}
      size="md"
      data-testid="pdf-editor-review-close-prompt"
    >
      <Stack gap="md">
        <Text size="sm">
          {t(
            "pdfTextEditor.review.closePrompt.body",
            "Your tags are not in your workspace yet. Closing accessibility settings without saving loses them.",
          )}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button
            variant="tertiary"
            accent="neutral"
            disabled={saving}
            onClick={() => reviewMode.set({ closeRequested: false })}
          >
            {t("pdfTextEditor.review.closePrompt.keep", "Keep tagging")}
          </Button>
          <Button
            variant="secondary"
            accent="danger"
            disabled={saving}
            onClick={() => {
              pageTool?.onDiscard?.();
              reviewMode.close();
            }}
            data-testid="pdf-editor-review-close-discard"
          >
            {t("pdfTextEditor.review.closePrompt.discard", "Discard")}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={() => void save()}
            data-testid="pdf-editor-review-close-save"
          >
            {t("pdfTextEditor.review.closePrompt.save", "Save and close")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
