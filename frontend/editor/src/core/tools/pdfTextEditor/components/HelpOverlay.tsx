import { Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { KeyCombo } from "@app/ui/KeyCombo";
import "@app/tools/pdfTextEditor/components/HelpOverlay.css";

interface HelpOverlayProps {
  opened: boolean;
  onClose: () => void;
}

interface Shortcut {
  /** Keys exactly as pressed - see the spacing rule below. */
  keys: string;
  description: string;
}

interface Section {
  heading: string;
  items: Shortcut[];
}

/**
 * Keyboard shortcuts for the PDF text/image editor - and only those.
 *
 * Nothing here describes a toolbar control, a mouse gesture, or what a key does
 * inside a field it is already obvious in. A shortcut list people trust is one
 * they can scan for a key they did not know about; padding it with "Font family
 * - swap to another font" or "Drag - move image" turns it into a feature tour
 * and buries the handful of things it exists to tell you.
 *
 * Every `keys` string is written as separate keys joined by " + ", never as a
 * run-on like "Ctrl+Click": KeyCombo splits on that separator to give each key
 * its own tile, so the spacing is what keeps the whole list consistent. Where a
 * shortcut has alternatives, separate them with " / ".
 */
export function HelpOverlay({ opened, onClose }: HelpOverlayProps) {
  const { t } = useTranslation();
  const SHORTCUTS: Section[] = [
    {
      heading: t("pdfTextEditor.help.editing.heading", "Editing"),
      items: [
        {
          keys: t(
            "pdfTextEditor.help.editing.shiftClickKey",
            "Ctrl + Click / Shift + Click",
          ),
          description: t(
            "pdfTextEditor.help.editing.shiftClickDesc",
            "Add / remove a run from selection",
          ),
        },
        {
          keys: t(
            "pdfTextEditor.help.editing.marqueeKey",
            "Ctrl + Shift + Drag",
          ),
          description: t(
            "pdfTextEditor.help.editing.marqueeDesc",
            "Marquee multi-select",
          ),
        },
        {
          keys: t("pdfTextEditor.help.editing.moveKey", "Ctrl + Click + Drag"),
          description: t(
            "pdfTextEditor.help.editing.moveDesc",
            "Move text run",
          ),
        },
        {
          keys: t("pdfTextEditor.help.editing.selectAllKey", "Ctrl + A"),
          description: t(
            "pdfTextEditor.help.editing.selectAllDesc",
            "Select all",
          ),
        },
        {
          keys: t("pdfTextEditor.help.editing.groupKey", "Ctrl + M"),
          description: t(
            "pdfTextEditor.help.editing.groupDesc",
            "Group selected runs into one paragraph",
          ),
        },
        {
          keys: t("pdfTextEditor.help.editing.duplicateKey", "Ctrl + D"),
          description: t(
            "pdfTextEditor.help.editing.duplicateDesc",
            "Duplicate selected",
          ),
        },
        {
          keys: t("pdfTextEditor.help.editing.deleteKey", "Delete"),
          description: t(
            "pdfTextEditor.help.editing.deleteDesc",
            "Remove selected",
          ),
        },
        {
          keys: t(
            "pdfTextEditor.help.editing.undoRedoKey",
            "Ctrl + Z / Ctrl + Y",
          ),
          description: t(
            "pdfTextEditor.help.editing.undoRedoDesc",
            "Undo / Redo",
          ),
        },
      ],
    },
    {
      heading: t("pdfTextEditor.help.clipboard.heading", "Clipboard"),
      items: [
        {
          keys: t("pdfTextEditor.help.clipboard.copyKey", "Ctrl + C"),
          description: t(
            "pdfTextEditor.help.clipboard.copyDesc",
            "Copy selected text",
          ),
        },
        {
          keys: t("pdfTextEditor.help.clipboard.cutKey", "Ctrl + X"),
          description: t(
            "pdfTextEditor.help.clipboard.cutDesc",
            "Cut selected (copy + delete)",
          ),
        },
        {
          keys: t("pdfTextEditor.help.clipboard.pasteKey", "Ctrl + V"),
          description: t(
            "pdfTextEditor.help.clipboard.pasteDesc",
            "Paste clipboard text as new run",
          ),
        },
        {
          keys: t(
            "pdfTextEditor.help.clipboard.pastePlainKey",
            "Ctrl + Shift + V",
          ),
          description: t(
            "pdfTextEditor.help.clipboard.pastePlainDesc",
            "Paste as plain text",
          ),
        },
      ],
    },
    {
      heading: t("pdfTextEditor.help.find.heading", "Find & replace"),
      items: [
        {
          keys: t("pdfTextEditor.help.find.openKey", "Ctrl + F"),
          description: t(
            "pdfTextEditor.help.find.openDesc",
            "Open find bar (and replace)",
          ),
        },
        {
          keys: t("pdfTextEditor.help.find.nextKey", "F3 / Ctrl + G"),
          description: t(
            "pdfTextEditor.help.find.nextDesc",
            "Next match (add Shift for previous)",
          ),
        },
      ],
    },
    {
      heading: t("pdfTextEditor.help.navigation.heading", "Navigation"),
      items: [
        {
          keys: t("pdfTextEditor.help.navigation.pageKey", "PageUp / PageDown"),
          description: t(
            "pdfTextEditor.help.navigation.pageDesc",
            "Previous / next page",
          ),
        },
        {
          keys: t(
            "pdfTextEditor.help.navigation.firstLastKey",
            "Ctrl + Home / Ctrl + End",
          ),
          description: t(
            "pdfTextEditor.help.navigation.firstLastDesc",
            "First / last page",
          ),
        },
        {
          keys: t("pdfTextEditor.help.navigation.zoomKey", "Ctrl + Wheel"),
          description: t(
            "pdfTextEditor.help.navigation.zoomDesc",
            "Zoom in / out",
          ),
        },
      ],
    },
    {
      heading: t("pdfTextEditor.help.document.heading", "Document"),
      items: [
        {
          keys: t("pdfTextEditor.help.document.saveKey", "Ctrl + S"),
          description: t(
            "pdfTextEditor.help.document.saveDesc",
            "Save to your workspace",
          ),
        },
        {
          keys: t("pdfTextEditor.help.document.helpKey", "? / F1"),
          description: t("pdfTextEditor.help.document.helpDesc", "This help"),
        },
        {
          keys: t("pdfTextEditor.help.document.escKey", "Esc"),
          description: t(
            "pdfTextEditor.help.document.escDesc",
            "Clear selection / close find / close help",
          ),
        },
      ],
    },
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("pdfTextEditor.help.title", "Keyboard shortcuts")}
      size="lg"
      data-testid="pdf-editor-help-overlay"
    >
      <Stack gap="lg">
        {SHORTCUTS.map((section) => (
          <section key={section.heading}>
            <h3 className="pdf-editor-help__section-title">
              {section.heading}
            </h3>
            <div className="pdf-editor-help__card">
              {section.items.map((item) => (
                <div
                  className="pdf-editor-help__row"
                  key={`${section.heading}-${item.description}`}
                >
                  <Text className="pdf-editor-help__label">
                    {item.description}
                  </Text>
                  <span className="pdf-editor-help__keys">
                    <KeyCombo combo={item.keys} />
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </Stack>
    </Modal>
  );
}
