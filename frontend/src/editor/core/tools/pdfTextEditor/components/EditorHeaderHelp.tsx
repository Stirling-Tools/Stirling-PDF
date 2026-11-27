import { createPortal } from "react-dom";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import { useToolPanelHeaderSlot } from "@editor/components/shared/toolPanelHeaderSlot";

/** The editor's keyboard-shortcuts button, beside its title in the tool panel header. */
export function EditorHeaderHelp({ onShowHelp }: { onShowHelp: () => void }) {
  const { t } = useTranslation();
  const slot = useToolPanelHeaderSlot();
  if (!slot) return null;
  const label = t("pdfTextEditor.help.ariaLabel", "Keyboard shortcuts");
  return createPortal(
    <Tooltip label={t("pdfTextEditor.help.tooltip", "Keyboard shortcuts (?)")}>
      <ActionIcon
        variant="tertiary"
        accent="neutral"
        shape="circle"
        size="sm"
        onClick={onShowHelp}
        aria-label={label}
        data-testid="pdf-editor-help"
      >
        <Icon name="circle-question-mark" size={16} />
      </ActionIcon>
    </Tooltip>,
    slot,
  );
}
