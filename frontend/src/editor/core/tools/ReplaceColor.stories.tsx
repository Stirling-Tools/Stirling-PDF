import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openColorPicker,
  openSelect,
  openTooltip,
  type PlayContext,
  runToResults,
  selectOption,
  typeInto,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Replace & Invert Color/Panel",
  ...toolPanelMeta("replaceColor"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const OPERATION = "Color operation";
const HIGH_CONTRAST = "High contrast color options";
const TEXT_COLOR = "Choose text Color";
const BACKGROUND_COLOR = "Choose background Color";

function pickOperation(option: string) {
  return (context: PlayContext) => selectOption(context, OPERATION, option);
}

const chooseCustom = pickOperation("Custom");

async function typeColor(context: PlayContext, label: string, hex: string) {
  const input = await typeInto(context, label, hex);
  await userEvent.tab();
  await waitFor(() => expect(input).toHaveValue(hex));
}

export const Panel: Story = {
  play: async (context) => {
    const panel = await waitForPanelText(context, HIGH_CONTRAST);
    await expect(panel.getByRole("textbox", { name: OPERATION })).toHaveValue(
      "High contrast",
    );
    await expect(
      panel.getByRole("textbox", { name: HIGH_CONTRAST }),
    ).toHaveValue("White text on black background");
  },
};

export const ColorOperationOptions: Story = {
  // The Color operation listbox has no accessible name.
  parameters: knownA11yIssues("aria-input-field-name"),
  play: async (context) => {
    const listbox = await openSelect(context, OPERATION);
    for (const option of [
      "High contrast",
      "Invert all colors",
      "Custom",
      "Convert to CMYK",
    ])
      await expect(listbox.getByRole("option", { name: option })).toBeVisible();
  },
};

export const HighContrastOptions: Story = {
  // The High contrast listbox has no accessible name.
  parameters: knownA11yIssues("aria-input-field-name"),
  play: async (context) => {
    const listbox = await openSelect(context, HIGH_CONTRAST);
    await expect(
      listbox.getByRole("option", {
        name: "Green text on black background",
      }),
    ).toBeVisible();
  },
};

export const YellowTextOnBlack: Story = {
  play: (context) =>
    selectOption(context, HIGH_CONTRAST, "Yellow text on black background"),
};

export const InvertAllColors: Story = {
  play: async (context) => {
    const panel = await pickOperation("Invert all colors")(context);
    await expect(panel.queryByText(HIGH_CONTRAST)).toBeNull();
  },
};

export const ConvertToCmyk: Story = {
  play: async (context) => {
    const panel = await pickOperation("Convert to CMYK")(context);
    await expect(panel.queryByText(HIGH_CONTRAST)).toBeNull();
  },
};

export const CustomColors: Story = {
  play: async (context) => {
    const panel = await chooseCustom(context);
    await expect(panel.getByRole("textbox", { name: TEXT_COLOR })).toHaveValue(
      "#000000",
    );
    await expect(
      panel.getByRole("textbox", { name: BACKGROUND_COLOR }),
    ).toHaveValue("#ffffff");
  },
};

export const CustomColorsEntered: Story = {
  // The colour picker's saturation slider has no accessible name.
  parameters: knownA11yIssues("aria-input-field-name"),
  play: async (context) => {
    await chooseCustom(context);
    await typeColor(context, TEXT_COLOR, "#1f3a93"); // theme-allow-color a user-picked colour the tool sends to the server
    await typeColor(context, BACKGROUND_COLOR, "#fff8e1"); // theme-allow-color a user-picked colour the tool sends to the server
  },
};

export const TextColorPicker: Story = {
  // The colour picker's saturation slider has no accessible name.
  parameters: knownA11yIssues("aria-input-field-name"),
  play: async (context) => {
    await chooseCustom(context);
    await openColorPicker(context, TEXT_COLOR);
  },
};

export const SettingsTooltip: Story = {
  // The tooltip's body scrolls but cannot take keyboard focus.
  parameters: knownA11yIssues("scrollable-region-focusable"),
  play: openTooltip({ step: "Settings" }),
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/misc/replace-invert-pdf", "sample.pdf"),
  ),
  play: runToResults,
};
