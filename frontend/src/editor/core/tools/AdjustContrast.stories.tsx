import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  openStep,
  openTooltip,
  type PanelQueries,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Adjust Colors & Contrast/Panel",
  ...toolPanelMeta("adjustContrast"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const SEVERAL_FILES = {
  files: ["sample.pdf", "multi-page-sample.pdf"],
  workbench: "fileEditor",
} as const;

async function setSlider(panel: PanelQueries, label: string, value: number) {
  const input = panel.getByRole("textbox", { name: label });
  await waitFor(() => expect(input).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.clear(input);
  await userEvent.type(input, String(value));
  await waitFor(() =>
    expect(panel.getByRole("slider", { name: label })).toHaveAttribute(
      "aria-valuenow",
      String(value),
    ),
  );
}

async function openAdjustColors(context: PlayContext) {
  await openStep(context, "Colors");
  return waitForPanelText(context, "Red");
}

async function waitForPreview({ canvasElement }: PlayContext) {
  await waitFor(
    () =>
      expect(
        canvasElement.ownerDocument.querySelector(
          '[data-sidebar="tool-panel"] canvas',
        ),
      ).not.toBeNull(),
    STAGE_TIMEOUT,
  );
}

export const Panel: Story = {
  play: async (context) => {
    const panel = await waitForPanelText(context, "Contrast");
    for (const label of ["Contrast", "Brightness", "Saturation"])
      await expect(panel.getByRole("slider", { name: label })).toHaveAttribute(
        "aria-valuenow",
        "100",
      );
    await expect(panel.queryByRole("slider", { name: "Red" })).toBeNull();
    await waitForPreview(context);
  },
};

export const BasicAdjustments: Story = {
  play: async (context) => {
    const panel = await waitForPanelText(context, "Contrast");
    await setSlider(panel, "Contrast", 140);
    await setSlider(panel, "Brightness", 85);
    await setSlider(panel, "Saturation", 60);
    await waitForPreview(context);
  },
};

export const AdjustColorsStep: Story = {
  play: async (context) => {
    const panel = await openAdjustColors(context);
    for (const label of ["Red", "Green", "Blue"])
      await expect(panel.getByRole("slider", { name: label })).toHaveAttribute(
        "aria-valuenow",
        "100",
      );
    await expect(panel.queryByRole("slider", { name: "Contrast" })).toBeNull();
  },
};

export const ColorsAdjusted: Story = {
  play: async (context) => {
    const panel = await openAdjustColors(context);
    await setSlider(panel, "Red", 120);
    await setSlider(panel, "Green", 100);
    await setSlider(panel, "Blue", 70);
    await waitForPreview(context);
  },
};

export const SeveralFiles: Story = {
  args: SEVERAL_FILES,
  play: async (context) => {
    const panel = await waitForPanelText(context, "1 of 2");
    await userEvent.click(panel.getByRole("button", { name: "Next" }));
    await expect(await panel.findByText("2 of 2")).toBeVisible();
  },
};

export const NoFiles: Story = {
  args: { files: [] },
  play: async (context) => {
    const panel = await waitForPanelText(context, "Basic Adjustments");
    await expect(panel.queryByRole("slider", { name: "Contrast" })).toBeNull();
    await expect(panel.queryByText("Preview")).toBeNull();
  },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  play: async (context) => {
    await runToResults(context);
    await expect(
      bodyOf(context).queryByRole("slider", {
        name: "Contrast",
      }),
    ).toBeNull();
  },
};
