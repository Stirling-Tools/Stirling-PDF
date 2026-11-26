import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  dragOnPage,
  findPageElement,
  openTooltip,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
  toggle,
  typeInto,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Crop PDF/Panel",
  ...toolPanelMeta("crop"),
};
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The draggable crop rectangle over the panel's page thumbnail, which has no
 * role or name to find it by.
 */
const CROP_OVERLAY = '[data-tour="crop-settings"] [style*="cursor: move"]';

function waitForCropArea(context: PlayContext) {
  return waitForPanelText(context, "Crop Area Selection");
}

async function enterPages(context: PlayContext, pages: string) {
  await waitForCropArea(context);
  return typeInto(context, "Pages to Crop", pages);
}

/**
 * Retypes until the width holds: page measurements CropSettings started before
 * the edit can land after it and reset the area to the full page.
 */
async function enterWidth(context: PlayContext, width: string) {
  const panel = await waitForCropArea(context);
  const input = panel.getByRole("textbox", { name: "Width" });
  if (!(input instanceof HTMLInputElement))
    throw new Error("Width is no input");
  const reset = panel.getByRole("button", { name: "Reset to full PDF" });
  await waitFor(async () => {
    if (input.value !== width)
      await userEvent.type(input, width, {
        initialSelectionStart: 0,
        initialSelectionEnd: input.value.length,
      });
    expect(input).toHaveValue(width);
    expect(reset).toBeEnabled();
  }, STAGE_TIMEOUT);
  return panel;
}

async function invalidPages(context: PlayContext) {
  await enterPages(context, "1,x");
  await waitForPanelText(context, /^Invalid page selection/);
}

export const Panel: Story = {};

export const NoFiles: Story = {
  args: { files: [] },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const AutoCropWhitespace: Story = {
  play: async (context) => {
    await waitForCropArea(context);
    const panel = await toggle(context, "checkbox", "Auto-crop whitespace");
    await waitFor(() =>
      expect(panel.queryByText("Crop Area Selection")).toBeNull(),
    );
    await expect(panel.queryByText("Position and Size")).toBeNull();
  },
};

export const SpecificPages: Story = {
  play: async (context) => {
    const pages = await enterPages(context, "1, 3-");
    await expect(pages).toHaveValue("1, 3-");
  },
};

export const InvalidPageSelection: Story = {
  play: invalidPages,
};

export const InvalidPageSelectionTooltip: Story = {
  play: openTooltip({ runButton: true }, { after: invalidPages }),
};

export const CustomCropArea: Story = {
  play: async (context) => {
    await enterWidth(context, "300");
  },
};

export const ResetToFullPdf: Story = {
  play: async (context) => {
    const panel = await enterWidth(context, "300");
    const reset = panel.getByRole("button", { name: "Reset to full PDF" });
    await userEvent.click(reset);
    await waitFor(() => expect(reset).toBeDisabled(), STAGE_TIMEOUT);
  },
};

export const DragCropCorner: Story = {
  play: async (context) => {
    const panel = await waitForCropArea(context);
    const reset = panel.getByRole("button", { name: "Reset to full PDF" });
    // Redrags until the area holds, for the same late page measurement that
    // enterWidth retypes for.
    await waitFor(async () => {
      if (reset.hasAttribute("disabled")) {
        const overlay = await findPageElement(context, CROP_OVERLAY);
        await waitFor(() => expect(overlay.getAnimations()).toHaveLength(0));
        await dragOnPage(
          context,
          { x: 0.99, y: 0.99 },
          { x: 0.6, y: 0.6 },
          CROP_OVERLAY,
        );
      }
      expect(reset).toBeEnabled();
    }, STAGE_TIMEOUT);
  },
};

export const SelectCropAreaTooltip: Story = {
  play: openTooltip({ step: "Select Crop Area" }),
};

export const PagesToCropTooltip: Story = {
  play: openTooltip(
    { info: /^Crop the selected area on specific pages/ },
    { after: waitForCropArea },
  ),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/general/crop", "sample.pdf"),
  ),
  play: async (context) => {
    await enterWidth(context, "300");
    await runToResults(context);
  },
};
