import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  findEnabled,
  openColorPicker,
  openSelect,
  openStep,
  openTooltip,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
  toggle,
  uploadToPanel,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Add Watermark/Panel",
  ...toolPanelMeta("watermark"),
};
export default meta;

type Story = StoryObj<typeof meta>;

async function chooseText(context: PlayContext) {
  const panel = await choose(context, "Text");
  return panel.findByPlaceholderText(
    "Enter watermark text",
    undefined,
    STAGE_TIMEOUT,
  );
}

async function enterWording(context: PlayContext) {
  await userEvent.type(await chooseText(context), "CONFIDENTIAL");
}

async function chooseImage(context: PlayContext) {
  const panel = await choose(context, "Image");
  await panel.findByRole("button", { name: "Choose Image" }, STAGE_TIMEOUT);
}

async function uploadWatermarkImage(context: PlayContext) {
  await chooseImage(context);
  const panel = await uploadToPanel(context, "sample.png");
  await panel.findByText("sample.png", undefined, STAGE_TIMEOUT);
}

async function openTextStyle(context: PlayContext) {
  await chooseText(context);
  const panel = await openStep(context, "Style");
  return panel.findByRole(
    "textbox",
    { name: "Watermark Color" },
    STAGE_TIMEOUT,
  );
}

async function openFormatting(context: PlayContext) {
  const panel = await openStep(context, "Formatting");
  await panel.findByRole(
    "checkbox",
    { name: "Flatten PDF pages to images" },
    STAGE_TIMEOUT,
  );
  return panel;
}

export const Panel: Story = {};

export const NoFiles: Story = {
  args: { files: [] },
};

export const TextWatermark: Story = {
  play: chooseText,
};

export const WordingEntered: Story = {
  play: async (context) => {
    await enterWording(context);
    await findEnabled(context, "button", /^Add Watermark/);
  },
};

export const TextStyle: Story = {
  play: openTextStyle,
};

export const ColorPicker: Story = {
  // The picker's saturation and hue sliders have no accessible name.
  parameters: knownA11yIssues("aria-input-field-name"),
  play: async (context) => {
    await openTextStyle(context);
    await openColorPicker(context, "Watermark Color");
  },
};

export const FontLanguageMenu: Story = {
  play: async (context) => {
    await openTextStyle(context);
    const options = await openSelect(context, "Font/Language");
    await expect(options.getAllByRole("option").length).toBeGreaterThan(1);
  },
};

export const TextFormatting: Story = {
  play: async (context) => {
    await chooseText(context);
    await openFormatting(context);
  },
};

export const FlattenToImages: Story = {
  play: async (context) => {
    await chooseText(context);
    await openFormatting(context);
    await toggle(context, "checkbox", "Flatten PDF pages to images");
  },
};

export const ImageWatermark: Story = {
  play: chooseImage,
};

export const ImageChosen: Story = {
  play: uploadWatermarkImage,
};

export const ImageFormatting: Story = {
  play: async (context) => {
    await uploadWatermarkImage(context);
    await openFormatting(context);
  },
};

export const WatermarkTypeTooltip: Story = {
  play: openTooltip({ step: "Watermark Type" }),
};

export const WordingTooltip: Story = {
  play: openTooltip({ step: "Wording" }, { after: chooseText }),
};

export const StyleTooltip: Story = {
  play: openTooltip({ step: "Style" }, { after: openTextStyle }),
};

export const FormattingTooltip: Story = {
  // The tooltip's body scrolls but cannot take keyboard focus.
  parameters: knownA11yIssues("scrollable-region-focusable"),
  play: openTooltip(
    { step: "Formatting" },
    {
      after: async (context) => {
        await chooseText(context);
        await openFormatting(context);
      },
    },
  ),
};

export const WatermarkFileTooltip: Story = {
  play: openTooltip({ step: "Watermark File" }, { after: chooseImage }),
};

export const SettingsRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/security/add-watermark", "sample.pdf"),
  ),
  play: async (context) => {
    await enterWording(context);
    await runToResults(context);
  },
};
