/**
 * A div dressed as a disabled button. Mantine's `disabled` kills pointer events
 * outright, which also kills the tooltip explaining *why* the control is
 * unavailable — so this renders the disabled look by hand and keeps hover.
 *
 * Desktop-layer stories resolve `@app/*` against desktop → cloud → proprietary
 * → core, matching the desktop build rather than the editor's order.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DisabledButtonWithTooltip } from "@app/components/shared/DisabledButtonWithTooltip";

const meta: Meta<typeof DisabledButtonWithTooltip> = {
  title: "Desktop/DisabledButtonWithTooltip",
  component: DisabledButtonWithTooltip,
  parameters: { layout: "padded" },
  args: {
    tooltip: "Sign in to use this tool",
    children: "Convert to PDF/A",
  },
};
export default meta;

type Story = StoryObj<typeof DisabledButtonWithTooltip>;

/** The tooltip only appears on hover, so the resting state is what is captured. */
export const Default: Story = {};

export const LongLabel: Story = {
  args: { children: "Convert this document to an archival PDF/A-3b file" },
};

/** A long reason wraps inside the tooltip rather than widening it. */
export const LongTooltip: Story = {
  args: {
    tooltip:
      "This tool needs a desktop licence and an active connection to the cloud backend.",
  },
};

/** In a narrow column the control still fills its container. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 200 }}>
        <Story />
      </div>
    ),
  ],
};
