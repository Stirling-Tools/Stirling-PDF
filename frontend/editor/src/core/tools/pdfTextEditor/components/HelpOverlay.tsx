import { Modal, Stack, Text, Group, Kbd, Divider } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface HelpOverlayProps {
  opened: boolean;
  onClose: () => void;
}

/** Keyboard + click reference for the PDF text/image editor. */
export function HelpOverlay({ opened, onClose }: HelpOverlayProps) {
  const { t } = useTranslation();
  const SHORTCUTS: Array<{
    heading: string;
    items: Array<[string, string]>;
  }> = [
    {
      heading: t("pdfTextEditor.help.editing.heading", "Editing"),
      items: [
        [
          t("pdfTextEditor.help.editing.clickKey", "Click"),
          t("pdfTextEditor.help.editing.clickDesc", "Edit text"),
        ],
        [
          t(
            "pdfTextEditor.help.editing.shiftClickKey",
            "Ctrl+Click / Shift+Click",
          ),
          t(
            "pdfTextEditor.help.editing.shiftClickDesc",
            "Add / remove a run from selection",
          ),
        ],
        [
          t("pdfTextEditor.help.editing.marqueeKey", "Ctrl+Shift+drag"),
          t("pdfTextEditor.help.editing.marqueeDesc", "Marquee multi-select"),
        ],
        [
          t("pdfTextEditor.help.editing.groupKey", "Ctrl+M"),
          t(
            "pdfTextEditor.help.editing.groupDesc",
            "Group selected runs (Group button)",
          ),
        ],
        [
          t("pdfTextEditor.help.editing.ungroupKey", "-"),
          t(
            "pdfTextEditor.help.editing.ungroupDesc",
            "Ungroup paragraph: select it, click Ungroup",
          ),
        ],
        [
          t("pdfTextEditor.help.editing.moveKey", "Ctrl+Click + drag"),
          t("pdfTextEditor.help.editing.moveDesc", "Move text run"),
        ],
        [
          t("pdfTextEditor.help.editing.deleteKey", "Delete"),
          t("pdfTextEditor.help.editing.deleteDesc", "Remove selected"),
        ],
        [
          t("pdfTextEditor.help.editing.duplicateKey", "Ctrl+D"),
          t("pdfTextEditor.help.editing.duplicateDesc", "Duplicate selected"),
        ],
        [
          t("pdfTextEditor.help.editing.selectAllKey", "Ctrl+A"),
          t("pdfTextEditor.help.editing.selectAllDesc", "Select all"),
        ],
        [
          t("pdfTextEditor.help.editing.undoRedoKey", "Ctrl+Z / Ctrl+Y"),
          t("pdfTextEditor.help.editing.undoRedoDesc", "Undo / Redo"),
        ],
      ],
    },
    {
      heading: t("pdfTextEditor.help.clipboard.heading", "Clipboard"),
      items: [
        [
          t("pdfTextEditor.help.clipboard.copyKey", "Ctrl+C"),
          t("pdfTextEditor.help.clipboard.copyDesc", "Copy selected text"),
        ],
        [
          t("pdfTextEditor.help.clipboard.cutKey", "Ctrl+X"),
          t(
            "pdfTextEditor.help.clipboard.cutDesc",
            "Cut selected (copy + delete)",
          ),
        ],
        [
          t("pdfTextEditor.help.clipboard.pasteKey", "Ctrl+V"),
          t(
            "pdfTextEditor.help.clipboard.pasteDesc",
            "Paste clipboard text as new run",
          ),
        ],
        [
          t("pdfTextEditor.help.clipboard.pastePlainKey", "Ctrl+Shift+V"),
          t(
            "pdfTextEditor.help.clipboard.pastePlainDesc",
            "Paste as plain text",
          ),
        ],
      ],
    },
    {
      heading: t("pdfTextEditor.help.find.heading", "Find & Replace"),
      items: [
        [
          t("pdfTextEditor.help.find.openKey", "Ctrl+F"),
          t("pdfTextEditor.help.find.openDesc", "Open find bar (and replace)"),
        ],
        [
          t("pdfTextEditor.help.find.nextKey", "F3 / Ctrl+G"),
          t(
            "pdfTextEditor.help.find.nextDesc",
            "Next match (Shift = previous)",
          ),
        ],
        [
          t("pdfTextEditor.help.find.enterFindKey", "Enter (in find)"),
          t("pdfTextEditor.help.find.enterFindDesc", "Next match"),
        ],
        [
          t("pdfTextEditor.help.find.enterReplaceKey", "Enter (in replace)"),
          t(
            "pdfTextEditor.help.find.enterReplaceDesc",
            "Replace one (Shift = Replace All)",
          ),
        ],
      ],
    },
    {
      heading: t(
        "pdfTextEditor.help.arrangement.heading",
        "Object arrangement",
      ),
      items: [
        [
          t("pdfTextEditor.help.arrangement.orderKey", "Toolbar ↑ ↓"),
          t(
            "pdfTextEditor.help.arrangement.orderDesc",
            "Bring forward / send backward (one step)",
          ),
        ],
        [
          t(
            "pdfTextEditor.help.arrangement.frontBackKey",
            "Toolbar front/back",
          ),
          t(
            "pdfTextEditor.help.arrangement.frontBackDesc",
            "Bring to front / send to back",
          ),
        ],
        [
          t("pdfTextEditor.help.arrangement.alignKey", "Toolbar align"),
          t(
            "pdfTextEditor.help.arrangement.alignDesc",
            "Align edges L / centre / R / T / mid / B",
          ),
        ],
        [
          t(
            "pdfTextEditor.help.arrangement.distributeKey",
            "Toolbar distribute",
          ),
          t(
            "pdfTextEditor.help.arrangement.distributeDesc",
            "Equal horizontal / vertical spacing (3+)",
          ),
        ],
        [
          t("pdfTextEditor.help.arrangement.lockKey", "Lock button"),
          t(
            "pdfTextEditor.help.arrangement.lockDesc",
            "Lock / unlock selection (session-only)",
          ),
        ],
      ],
    },
    {
      heading: t("pdfTextEditor.help.image.heading", "Image"),
      items: [
        [
          t("pdfTextEditor.help.image.rotateKey", "Toolbar rotate"),
          t(
            "pdfTextEditor.help.image.rotateDesc",
            "Rotate 90° clockwise or counter-clockwise",
          ),
        ],
        [
          t("pdfTextEditor.help.image.flipKey", "Toolbar flip"),
          t(
            "pdfTextEditor.help.image.flipDesc",
            "Flip horizontally or vertically",
          ),
        ],
        [
          t("pdfTextEditor.help.image.resizeKey", "Corner drag"),
          t("pdfTextEditor.help.image.resizeDesc", "Resize image"),
        ],
        [
          t("pdfTextEditor.help.image.moveKey", "Drag"),
          t("pdfTextEditor.help.image.moveDesc", "Move image"),
        ],
      ],
    },
    {
      heading: t("pdfTextEditor.help.formatting.heading", "Text formatting"),
      items: [
        [
          t("pdfTextEditor.help.formatting.italicKey", "Toolbar I"),
          t("pdfTextEditor.help.formatting.italicDesc", "Italic"),
        ],
        [
          t("pdfTextEditor.help.formatting.fontSizeKey", "Toolbar font size"),
          t("pdfTextEditor.help.formatting.fontSizeDesc", "Change font size"),
        ],
        [
          t("pdfTextEditor.help.formatting.colourKey", "Toolbar colour"),
          t("pdfTextEditor.help.formatting.colourDesc", "Change fill colour"),
        ],
        [
          t(
            "pdfTextEditor.help.formatting.fontFamilyKey",
            "Toolbar font family",
          ),
          t(
            "pdfTextEditor.help.formatting.fontFamilyDesc",
            "Swap to base-14 font",
          ),
        ],
        [
          t("pdfTextEditor.help.formatting.caseKey", "Toolbar case (Aa)"),
          t(
            "pdfTextEditor.help.formatting.caseDesc",
            "Change case (upper/lower/title/sentence)",
          ),
        ],
      ],
    },
    {
      heading: t("pdfTextEditor.help.navigation.heading", "Navigation"),
      items: [
        [
          t("pdfTextEditor.help.navigation.pageKey", "PageDown / PageUp"),
          t("pdfTextEditor.help.navigation.pageDesc", "Next / previous page"),
        ],
        [
          t(
            "pdfTextEditor.help.navigation.firstLastKey",
            "Ctrl+Home / Ctrl+End",
          ),
          t("pdfTextEditor.help.navigation.firstLastDesc", "First / last page"),
        ],
        [
          t("pdfTextEditor.help.navigation.zoomKey", "Ctrl+Wheel"),
          t("pdfTextEditor.help.navigation.zoomDesc", "Zoom in / out"),
        ],
        [
          t("pdfTextEditor.help.navigation.toolbarZoomKey", "Toolbar zoom"),
          t(
            "pdfTextEditor.help.navigation.toolbarZoomDesc",
            "Manual zoom + Fit to width",
          ),
        ],
      ],
    },
    {
      heading: t("pdfTextEditor.help.document.heading", "Document"),
      items: [
        [
          t("pdfTextEditor.help.document.saveKey", "Ctrl+S"),
          t("pdfTextEditor.help.document.saveDesc", "Save to your workspace"),
        ],
        [
          t("pdfTextEditor.help.document.helpKey", "? / F1"),
          t("pdfTextEditor.help.document.helpDesc", "This help"),
        ],
        [
          t("pdfTextEditor.help.document.escKey", "Esc"),
          t(
            "pdfTextEditor.help.document.escDesc",
            "Clear selection / close find / close help",
          ),
        ],
      ],
    },
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("pdfTextEditor.help.title", "Keyboard shortcuts")}
      size="md"
      data-testid="pdf-editor-help-overlay"
    >
      <Stack gap="md">
        {SHORTCUTS.map((section, sectionIdx) => (
          <Stack key={section.heading} gap="xs">
            {sectionIdx > 0 && <Divider />}
            <Text fw={600} size="sm">
              {section.heading}
            </Text>
            {section.items.map(([keys, desc]) => (
              <Group
                key={`${section.heading}-${keys}`}
                justify="space-between"
                wrap="nowrap"
              >
                <Text size="sm" c="dimmed">
                  {desc}
                </Text>
                <Kbd>{keys}</Kbd>
              </Group>
            ))}
          </Stack>
        ))}
      </Stack>
    </Modal>
  );
}
