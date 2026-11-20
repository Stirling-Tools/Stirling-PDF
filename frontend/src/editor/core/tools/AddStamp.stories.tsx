import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  openTooltip,
  STAGE_TIMEOUT,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { DEFAULT_QR_SIZE } from "@editor/components/tools/addStamp/useAddStampParameters";

const meta = {
  title: "Tools/Add Stamp to PDF/Panel",
  ...toolPanelMeta("addStamp"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const imageStamp = {
  parameters: { stampType: "image" },
  parameterFiles: { stampImage: "sample.png" },
} as const;

const qrStamp = {
  parameters: {
    stampType: "qr",
    stampText: "https://stirlingpdf.com/@filename",
    fontSize: DEFAULT_QR_SIZE,
  },
} as const;

export const Panel: Story = {};

export const StampTextEntered: Story = {
  args: { parameters: { stampText: "Page @page_number of @total_pages" } },
};

export const ImageStamp: Story = {
  args: imageStamp,
};

export const ImageStampQuickPosition: Story = {
  args: imageStamp,
  play: async (context) => {
    const panel = await choose(context, "Quick Position");
    await panel.findByText(
      "Select a position on the page to place the stamp.",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const QrCodeStamp: Story = {
  args: qrStamp,
};

export const RotationSetting: Story = {
  args: { parameters: { _activePill: "rotation" } },
};

export const OpacitySetting: Story = {
  args: { parameters: { _activePill: "opacity" } },
};

export const PagesToStampTooltip: Story = {
  play: openTooltip({ info: /^Comma-separated page numbers/ }),
};

export const DynamicVariablesTooltip: Story = {
  play: openTooltip({ info: "Dynamic Variables" }),
};

export const QrCodeContentTooltip: Story = {
  args: qrStamp,
  play: openTooltip({ info: /^Text or link to encode/ }),
};
