import { Fragment } from "react";
import { Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import HotkeyDisplay from "@app/components/hotkeys/HotkeyDisplay";
import { isMacLike, type HotkeyBinding } from "@app/utils/hotkeys";
import "@app/tools/pdfTextEditor/components/HelpOverlay.css";

interface HelpOverlayProps {
  opened: boolean;
  onClose: () => void;
}

interface Shortcut {
  /** Rendered as alternatives, joined by "/". */
  bindings: HotkeyBinding[];
  description: string;
}

interface Section {
  heading: string;
  items: Shortcut[];
}

// The editor binds ctrlKey || metaKey, so the label follows the platform:
// Cmd on a Mac, Ctrl everywhere else.
const mod = (
  code: string,
  extra: Partial<HotkeyBinding> = {},
): HotkeyBinding => ({
  code,
  ...(isMacLike() ? { meta: true } : { ctrl: true }),
  ...extra,
});

/** Keyboard shortcuts for the PDF text/image editor. */
export function HelpOverlay({ opened, onClose }: HelpOverlayProps) {
  const { t } = useTranslation();
  const SHORTCUTS: Section[] = [
    {
      heading: t("pdfTextEditor.help.editing.heading", "Editing"),
      items: [
        {
          bindings: [mod("Click"), { code: "Click", shift: true }],
          description: t(
            "pdfTextEditor.help.editing.shiftClickDesc",
            "Add / remove a run from selection",
          ),
        },
        {
          bindings: [mod("Drag", { shift: true })],
          description: t(
            "pdfTextEditor.help.editing.marqueeDesc",
            "Marquee multi-select",
          ),
        },
        {
          bindings: [mod("Drag")],
          description: t(
            "pdfTextEditor.help.editing.moveDesc",
            "Move text run",
          ),
        },
        {
          bindings: [mod("KeyA")],
          description: t(
            "pdfTextEditor.help.editing.selectAllDesc",
            "Select all",
          ),
        },
        {
          bindings: [mod("KeyM")],
          description: t(
            "pdfTextEditor.help.editing.groupDesc",
            "Group selected runs into one paragraph",
          ),
        },
        {
          bindings: [mod("KeyD")],
          description: t(
            "pdfTextEditor.help.editing.duplicateDesc",
            "Duplicate selected",
          ),
        },
        {
          bindings: [{ code: "Delete" }],
          description: t(
            "pdfTextEditor.help.editing.deleteDesc",
            "Remove selected",
          ),
        },
        {
          bindings: [mod("KeyZ"), mod("KeyY")],
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
          bindings: [mod("KeyC")],
          description: t(
            "pdfTextEditor.help.clipboard.copyDesc",
            "Copy selected text",
          ),
        },
        {
          bindings: [mod("KeyX")],
          description: t(
            "pdfTextEditor.help.clipboard.cutDesc",
            "Cut selected (copy + delete)",
          ),
        },
        {
          bindings: [mod("KeyV")],
          description: t(
            "pdfTextEditor.help.clipboard.pasteDesc",
            "Paste clipboard text as new run",
          ),
        },
        {
          bindings: [mod("KeyV", { shift: true })],
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
          bindings: [mod("KeyF")],
          description: t(
            "pdfTextEditor.help.find.openDesc",
            "Open find bar (and replace)",
          ),
        },
        {
          bindings: [{ code: "F3" }, mod("KeyG")],
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
          bindings: [{ code: "PageUp" }, { code: "PageDown" }],
          description: t(
            "pdfTextEditor.help.navigation.pageDesc",
            "Previous / next page",
          ),
        },
        {
          bindings: [mod("Home"), mod("End")],
          description: t(
            "pdfTextEditor.help.navigation.firstLastDesc",
            "First / last page",
          ),
        },
        {
          bindings: [mod("Wheel")],
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
          bindings: [mod("KeyS")],
          description: t(
            "pdfTextEditor.help.document.saveDesc",
            "Save to your workspace",
          ),
        },
        {
          bindings: [{ code: "F1" }],
          description: t("pdfTextEditor.help.document.helpDesc", "This help"),
        },
        {
          bindings: [{ code: "Escape" }],
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
                    {item.bindings.map((binding, index) => (
                      <Fragment key={`${binding.code}-${index}`}>
                        {index > 0 && (
                          <span className="pdf-editor-help__or" aria-hidden>
                            /
                          </span>
                        )}
                        <HotkeyDisplay binding={binding} />
                      </Fragment>
                    ))}
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
