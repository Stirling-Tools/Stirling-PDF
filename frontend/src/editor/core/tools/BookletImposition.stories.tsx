import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Booklet Imposition/Panel",
  ...toolPanelMeta("bookletImposition"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const manualDuplexFirstPass = {
  parameters: { doubleSided: false, duplexPass: "FIRST" },
} as const;

const manualDuplexSecondPass = {
  parameters: { doubleSided: false, duplexPass: "SECOND" },
} as const;

export const Panel: Story = {};

export const ManualDuplexFirstPass: Story = {
  args: manualDuplexFirstPass,
};

export const ManualDuplexSecondPass: Story = {
  args: manualDuplexSecondPass,
};

export const GutterMargin: Story = {
  args: { parameters: { addGutter: true } },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const DoubleSidedTooltip: Story = {
  play: openTooltip({ info: /^Creates both front and back sides/ }),
};

export const ManualDuplexTooltip: Story = {
  args: manualDuplexFirstPass,
  play: openTooltip({ info: /^For printers without automatic duplex/ }),
};

export const FirstPassTooltip: Story = {
  args: manualDuplexFirstPass,
  play: openTooltip({ info: /^Prints front sides/ }),
};

export const SecondPassTooltip: Story = {
  args: manualDuplexSecondPass,
  play: openTooltip({ info: /^Load printed stack face-down/ }),
};

export const RightToLeftBindingTooltip: Story = {
  play: openTooltip({ info: /^For Arabic, Hebrew/ }),
};

export const AddBordersTooltip: Story = {
  play: openTooltip({ info: /^Adds borders around each page section/ }),
};

export const GutterMarginTooltip: Story = {
  play: openTooltip({ info: /^Adds inner margin space for binding/ }),
};

export const FlipOnShortEdgeTooltip: Story = {
  play: openTooltip({ info: /^Enable for short-edge duplex printing/ }),
};

export const FlipOnShortEdgeManualDuplexTooltip: Story = {
  args: manualDuplexFirstPass,
  play: openTooltip({ info: /^Not needed in manual mode/ }),
};
