import { Modal, Stack, Text, Group, Kbd, Divider } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface HelpOverlayProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * Keyboard + click reference for the v2 text/image editor. Update this
 * list when shortcuts change or features are added/removed - it's the
 * single user-visible reference for editor capabilities.
 *
 * Document-level actions (page rotation, print, page reorder) live in
 * Stirling's dedicated PDF tools and have been intentionally removed
 * from this editor's surface.
 */
export function HelpOverlay({ opened, onClose }: HelpOverlayProps) {
  const { t } = useTranslation();
  const SHORTCUTS: Array<{
    heading: string;
    items: Array<[string, string]>;
  }> = [
    {
      heading: t("pdfTextEditorV2.help.editing.heading", "Editing"),
      items: [
        [
          t("pdfTextEditorV2.help.editing.clickKey", "Click"),
          t("pdfTextEditorV2.help.editing.clickDesc", "Edit text"),
        ],
        [
          t("pdfTextEditorV2.help.editing.shiftClickKey", "Shift+Click"),
          t(
            "pdfTextEditorV2.help.editing.shiftClickDesc",
            "Add / remove a run from selection",
          ),
        ],
        [
          t("pdfTextEditorV2.help.editing.marqueeKey", "Ctrl+Shift+drag"),
          t("pdfTextEditorV2.help.editing.marqueeDesc", "Marquee multi-select"),
        ],
        [
          t("pdfTextEditorV2.help.editing.groupKey", "Ctrl+M"),
          t(
            "pdfTextEditorV2.help.editing.groupDesc",
            "Group selected runs (Group button)",
          ),
        ],
        [
          t("pdfTextEditorV2.help.editing.ungroupKey", "-"),
          t(
            "pdfTextEditorV2.help.editing.ungroupDesc",
            "Ungroup paragraph: select it, click Ungroup",
          ),
        ],
        [
          t("pdfTextEditorV2.help.editing.moveKey", "Ctrl+Click + drag"),
          t("pdfTextEditorV2.help.editing.moveDesc", "Move text run"),
        ],
        [
          t("pdfTextEditorV2.help.editing.deleteKey", "Delete"),
          t("pdfTextEditorV2.help.editing.deleteDesc", "Remove selected"),
        ],
        [
          t("pdfTextEditorV2.help.editing.duplicateKey", "Ctrl+D"),
          t("pdfTextEditorV2.help.editing.duplicateDesc", "Duplicate selected"),
        ],
        [
          t("pdfTextEditorV2.help.editing.selectAllKey", "Ctrl+A"),
          t("pdfTextEditorV2.help.editing.selectAllDesc", "Select all"),
        ],
        [
          t("pdfTextEditorV2.help.editing.undoRedoKey", "Ctrl+Z / Ctrl+Y"),
          t("pdfTextEditorV2.help.editing.undoRedoDesc", "Undo / Redo"),
        ],
      ],
    },
    {
      heading: t("pdfTextEditorV2.help.clipboard.heading", "Clipboard"),
      items: [
        [
          t("pdfTextEditorV2.help.clipboard.copyKey", "Ctrl+C"),
          t("pdfTextEditorV2.help.clipboard.copyDesc", "Copy selected text"),
        ],
        [
          t("pdfTextEditorV2.help.clipboard.cutKey", "Ctrl+X"),
          t(
            "pdfTextEditorV2.help.clipboard.cutDesc",
            "Cut selected (copy + delete)",
          ),
        ],
        [
          t("pdfTextEditorV2.help.clipboard.pasteKey", "Ctrl+V"),
          t(
            "pdfTextEditorV2.help.clipboard.pasteDesc",
            "Paste clipboard text as new run",
          ),
        ],
        [
          t("pdfTextEditorV2.help.clipboard.pastePlainKey", "Ctrl+Shift+V"),
          t(
            "pdfTextEditorV2.help.clipboard.pastePlainDesc",
            "Paste as plain text",
          ),
        ],
      ],
    },
    {
      heading: t("pdfTextEditorV2.help.find.heading", "Find & Replace"),
      items: [
        [
          t("pdfTextEditorV2.help.find.openKey", "Ctrl+F"),
          t(
            "pdfTextEditorV2.help.find.openDesc",
            "Open find bar (and replace)",
          ),
        ],
        [
          t("pdfTextEditorV2.help.find.nextKey", "F3 / Ctrl+G"),
          t(
            "pdfTextEditorV2.help.find.nextDesc",
            "Next match (Shift = previous)",
          ),
        ],
        [
          t("pdfTextEditorV2.help.find.enterFindKey", "Enter (in find)"),
          t("pdfTextEditorV2.help.find.enterFindDesc", "Next match"),
        ],
        [
          t("pdfTextEditorV2.help.find.enterReplaceKey", "Enter (in replace)"),
          t(
            "pdfTextEditorV2.help.find.enterReplaceDesc",
            "Replace one (Shift = Replace All)",
          ),
        ],
      ],
    },
    {
      heading: t(
        "pdfTextEditorV2.help.arrangement.heading",
        "Object arrangement",
      ),
      items: [
        [
          t("pdfTextEditorV2.help.arrangement.orderKey", "Toolbar ↑ ↓"),
          t(
            "pdfTextEditorV2.help.arrangement.orderDesc",
            "Bring forward / send backward (one step)",
          ),
        ],
        [
          t(
            "pdfTextEditorV2.help.arrangement.frontBackKey",
            "Toolbar front/back",
          ),
          t(
            "pdfTextEditorV2.help.arrangement.frontBackDesc",
            "Bring to front / send to back",
          ),
        ],
        [
          t("pdfTextEditorV2.help.arrangement.alignKey", "Toolbar align"),
          t(
            "pdfTextEditorV2.help.arrangement.alignDesc",
            "Align edges L / centre / R / T / mid / B",
          ),
        ],
        [
          t(
            "pdfTextEditorV2.help.arrangement.distributeKey",
            "Toolbar distribute",
          ),
          t(
            "pdfTextEditorV2.help.arrangement.distributeDesc",
            "Equal horizontal / vertical spacing (3+)",
          ),
        ],
        [
          t("pdfTextEditorV2.help.arrangement.lockKey", "Lock button"),
          t(
            "pdfTextEditorV2.help.arrangement.lockDesc",
            "Lock / unlock selection (session-only)",
          ),
        ],
      ],
    },
    {
      heading: t("pdfTextEditorV2.help.image.heading", "Image"),
      items: [
        [
          t("pdfTextEditorV2.help.image.rotateKey", "Toolbar rotate"),
          t(
            "pdfTextEditorV2.help.image.rotateDesc",
            "Rotate 90° clockwise or counter-clockwise",
          ),
        ],
        [
          t("pdfTextEditorV2.help.image.flipKey", "Toolbar flip"),
          t(
            "pdfTextEditorV2.help.image.flipDesc",
            "Flip horizontally or vertically",
          ),
        ],
        [
          t("pdfTextEditorV2.help.image.resizeKey", "Corner drag"),
          t("pdfTextEditorV2.help.image.resizeDesc", "Resize image"),
        ],
        [
          t("pdfTextEditorV2.help.image.moveKey", "Drag"),
          t("pdfTextEditorV2.help.image.moveDesc", "Move image"),
        ],
      ],
    },
    {
      heading: t("pdfTextEditorV2.help.formatting.heading", "Text formatting"),
      items: [
        [
          t("pdfTextEditorV2.help.formatting.boldItalicKey", "Toolbar B / I"),
          t("pdfTextEditorV2.help.formatting.boldItalicDesc", "Bold / italic"),
        ],
        [
          t("pdfTextEditorV2.help.formatting.fontSizeKey", "Toolbar font size"),
          t("pdfTextEditorV2.help.formatting.fontSizeDesc", "Change font size"),
        ],
        [
          t("pdfTextEditorV2.help.formatting.colourKey", "Toolbar colour"),
          t("pdfTextEditorV2.help.formatting.colourDesc", "Change fill colour"),
        ],
        [
          t(
            "pdfTextEditorV2.help.formatting.fontFamilyKey",
            "Toolbar font family",
          ),
          t(
            "pdfTextEditorV2.help.formatting.fontFamilyDesc",
            "Swap to base-14 font",
          ),
        ],
        [
          t("pdfTextEditorV2.help.formatting.caseKey", "Toolbar case (Aa)"),
          t(
            "pdfTextEditorV2.help.formatting.caseDesc",
            "Change case (upper/lower/title/sentence)",
          ),
        ],
      ],
    },
    {
      heading: t("pdfTextEditorV2.help.navigation.heading", "Navigation"),
      items: [
        [
          t("pdfTextEditorV2.help.navigation.pageKey", "PageDown / PageUp"),
          t("pdfTextEditorV2.help.navigation.pageDesc", "Next / previous page"),
        ],
        [
          t(
            "pdfTextEditorV2.help.navigation.firstLastKey",
            "Ctrl+Home / Ctrl+End",
          ),
          t(
            "pdfTextEditorV2.help.navigation.firstLastDesc",
            "First / last page",
          ),
        ],
        [
          t("pdfTextEditorV2.help.navigation.zoomKey", "Ctrl+Wheel"),
          t("pdfTextEditorV2.help.navigation.zoomDesc", "Zoom in / out"),
        ],
        [
          t("pdfTextEditorV2.help.navigation.toolbarZoomKey", "Toolbar zoom"),
          t(
            "pdfTextEditorV2.help.navigation.toolbarZoomDesc",
            "Manual zoom + Fit to width",
          ),
        ],
      ],
    },
    {
      heading: t("pdfTextEditorV2.help.document.heading", "Document"),
      items: [
        [
          t("pdfTextEditorV2.help.document.saveKey", "Ctrl+S"),
          t("pdfTextEditorV2.help.document.saveDesc", "Download edited PDF"),
        ],
        [
          t("pdfTextEditorV2.help.document.helpKey", "? / F1"),
          t("pdfTextEditorV2.help.document.helpDesc", "This help"),
        ],
        [
          t("pdfTextEditorV2.help.document.escKey", "Esc"),
          t(
            "pdfTextEditorV2.help.document.escDesc",
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
      title={t("pdfTextEditorV2.help.title", "Keyboard shortcuts")}
      size="md"
      data-testid="v2-help-overlay"
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
