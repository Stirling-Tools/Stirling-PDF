import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PipelineIconPicker } from "@portal/components/pipelines/PipelineIconPicker";

const meta: Meta<typeof PipelineIconPicker> = {
  title: "Portal/Pipelines/PipelineIconPicker",
  component: PipelineIconPicker,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof PipelineIconPicker>;

/** Live picker: click the glyph to open the grid and choose a new icon. */
export const Default: Story = {
  render: () => {
    const [icon, setIcon] = useState("route");
    return <PipelineIconPicker value={icon} onChange={setIcon} />;
  },
};
