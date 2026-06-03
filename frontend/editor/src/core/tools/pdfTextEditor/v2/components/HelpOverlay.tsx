import { Modal, Stack, Text, Group, Kbd, Divider } from "@mantine/core";

interface HelpOverlayProps {
  opened: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ heading: string; items: Array<[string, string]> }> = [
  {
    heading: "Editing",
    items: [
      ["Click", "Edit text"],
      ["Shift+Click", "Multi-select"],
      ["Ctrl+Shift+drag", "Marquee select"],
      ["Shift+Click", "Add / remove a run from selection"],
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
    heading: "Navigation",
    items: [
      ["Ctrl+F", "Find"],
      ["F3 / Ctrl+G", "Next match (Shift = previous)"],
      ["PageDown / PageUp", "Next / previous page"],
      ["Ctrl+Home / Ctrl+End", "First / last page"],
      ["Ctrl+Wheel", "Zoom"],
    ],
  },
  {
    heading: "Document",
    items: [
      ["Ctrl+S", "Download edited PDF"],
      ["?", "This help"],
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
              <Group key={keys} justify="space-between" wrap="nowrap">
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
