import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolWorkflowTitle } from "@app/components/tools/shared/ToolWorkflowTitle";

/** The heading every tool panel opens with, optionally with a description line
 *  and an info tooltip. */
const meta: Meta<typeof ToolWorkflowTitle> = {
  title: "Tools/Shared/ToolWorkflowTitle",
  component: ToolWorkflowTitle,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof ToolWorkflowTitle>;

/** Title alone. */
export const Default: Story = { args: { title: "Rotate" } };

/** With a line explaining what the tool does. */
export const WithDescription: Story = {
  args: {
    title: "Auto-rotate",
    description:
      "Detects each page's orientation and straightens the ones that need it.",
  },
};

/** An info affordance next to the title, for tools whose behaviour needs
 *  qualifying beyond a single line. */
export const WithTooltip: Story = {
  args: {
    title: "Redact",
    description: "Permanently removes the selected content.",
    tooltip: {
      header: { title: "About redaction" },
      content:
        "Redaction rewrites the page content stream — the removed text cannot be recovered from the output file.",
    },
  },
};

/** A long title, to check it wraps rather than pushing the panel wider. */
export const LongTitle: Story = {
  args: {
    title: "Convert scanned images to a searchable PDF document",
    description: "Runs OCR over every page and embeds the recognised text.",
  },
};
