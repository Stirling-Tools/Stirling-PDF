import { Modal, Stack, Text, Group, Kbd, Divider } from "@mantine/core";

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
const SHORTCUTS: Array<{ heading: string; items: Array<[string, string]> }> = [
  {
    heading: "Editing",
    items: [
      ["Click", "Edit text"],
      ["Shift+Click", "Add / remove a run from selection"],
      ["Ctrl+Shift+drag", "Marquee multi-select"],
      ["Ctrl+M", "Group selected runs (Group button)"],
      ["—", "Ungroup paragraph: select it, click Ungroup"],
      ["Ctrl+Click + drag", "Move text run"],
      ["Delete", "Remove selected"],
      ["Ctrl+D", "Duplicate selected"],
      ["Ctrl+A", "Select all"],
      ["Ctrl+Z / Ctrl+Y", "Undo / Redo"],
    ],
  },
  {
    heading: "Clipboard",
    items: [
      ["Ctrl+C", "Copy selected text"],
      ["Ctrl+X", "Cut selected (copy + delete)"],
      ["Ctrl+V", "Paste clipboard text as new run"],
      ["Ctrl+Shift+V", "Paste as plain text"],
    ],
  },
  {
    heading: "Find & Replace",
    items: [
      ["Ctrl+F", "Open find bar (and replace)"],
      ["F3 / Ctrl+G", "Next match (Shift = previous)"],
      ["Enter (in find)", "Next match"],
      ["Enter (in replace)", "Replace one (Shift = Replace All)"],
    ],
  },
  {
    heading: "Object arrangement",
    items: [
      ["Toolbar ↑ ↓", "Bring forward / send backward (one step)"],
      ["Toolbar front/back", "Bring to front / send to back"],
      ["Toolbar align", "Align edges L / centre / R / T / mid / B"],
      ["Toolbar distribute", "Equal horizontal / vertical spacing (3+)"],
      ["Lock button", "Lock / unlock selection (session-only)"],
    ],
  },
  {
    heading: "Image",
    items: [
      ["Toolbar rotate", "Rotate 90° clockwise or counter-clockwise"],
      ["Toolbar flip", "Flip horizontally or vertically"],
      ["Corner drag", "Resize image"],
      ["Drag", "Move image"],
    ],
  },
  {
    heading: "Text formatting",
    items: [
      ["Toolbar B / I", "Bold / italic"],
      ["Toolbar font size", "Change font size"],
      ["Toolbar colour", "Change fill colour"],
      ["Toolbar font family", "Swap to base-14 font"],
      ["Toolbar case (Aa)", "Change case (upper/lower/title/sentence)"],
    ],
  },
  {
    heading: "Navigation",
    items: [
      ["PageDown / PageUp", "Next / previous page"],
      ["Ctrl+Home / Ctrl+End", "First / last page"],
      ["Ctrl+Wheel", "Zoom in / out"],
      ["Toolbar zoom", "Manual zoom + Fit to width"],
    ],
  },
  {
    heading: "Document",
    items: [
      ["Ctrl+S", "Download edited PDF"],
      ["? / F1", "This help"],
      ["Esc", "Clear selection / close find / close help"],
    ],
  },
];

export function HelpOverlay({ opened, onClose }: HelpOverlayProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Keyboard shortcuts"
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
