import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { LockBadge } from "@editor/tools/pdfTextEditor/components/LockBadge";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";

const PAGE = { width: 360, height: 160 };

/**
 * A locked item ignores clicks, so this covers it instead: hovering the box
 * (or tabbing to it) shows a badge on its corner that unlocks it.
 */
function LockBadgeDemo() {
  return (
    <Box
      pos="relative"
      w={PAGE.width}
      h={PAGE.height}
      style={{
        background: "var(--c-bg-raised)",
        border: "1px solid var(--c-border-subtle)",
      }}
    >
      <Box pos="absolute" left={40} top={60} fz={18} c="var(--c-text)">
        Locked heading
      </Box>
      <LockBadge
        rect={{ x: 38, y: 74, width: 140, height: 26 }}
        pageHeight={PAGE.height}
        transform={DisplayTransform.identity(PAGE.width, PAGE.height)}
        scale={1}
        onUnlock={() => {}}
        testId="pdf-editor-unlock-story"
      />
    </Box>
  );
}

const meta: Meta<typeof LockBadgeDemo> = {
  title: "Text editor/Lock badge",
  component: LockBadgeDemo,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Hover the heading to show the badge. */
export const Default: Story = {};
