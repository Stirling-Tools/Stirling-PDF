import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Flatten/Panel",
  ...toolPanelMeta("flatten", { files: ["form-fields-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const FormsOnly: Story = {
  args: { parameters: { flattenOnlyForms: true } },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const FlattenOnlyFormsTooltip: Story = {
  play: openTooltip({ info: /Only flatten form fields/ }),
};

export const RenderingDpiTooltip: Story = {
  play: openTooltip({ info: /Leave blank to use the system default/ }),
};
