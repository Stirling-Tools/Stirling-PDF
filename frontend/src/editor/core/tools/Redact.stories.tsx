import type { StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  dragOnPage,
  openTooltip,
  STAGE_TIMEOUT,
  waitForToolPanel,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Redact/Panel",
  ...toolPanelMeta("redact"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const manualMode = { parameters: { mode: "manual" } } as const;

const noFiles = { files: [] } as const;

export const Panel: Story = {};

export const WordsToRedactAdded: Story = {
  args: { parameters: { wordsToRedact: ["Confidential", "Top-Secret"] } },
};

export const ManualMode: Story = {
  args: manualMode,
};

export const ManualModeWithMarks: Story = {
  args: { ...manualMode, showWorkbench: true, workbench: "viewer" },
  play: async (context) => {
    const panel = within(await waitForToolPanel(context));
    const colour = await panel.findByLabelText(
      "Redaction Color",
      undefined,
      STAGE_TIMEOUT,
    );
    await waitFor(() => expect(colour).toBeEnabled(), STAGE_TIMEOUT);
    await dragOnPage(
      context,
      { x: 0.2, y: 0.2 },
      { x: 0.6, y: 0.4 },
      '[data-page-index="0"]',
    );
    await panel.findByRole(
      "button",
      { name: /^Apply Redactions \(1\)/ },
      STAGE_TIMEOUT,
    );
  },
};

export const NoFiles: Story = {
  args: noFiles,
};

export const RedactionMethodTooltip: Story = {
  play: openTooltip({ step: "Redaction Method" }),
};

export const RedactionSettingsTooltip: Story = {
  play: openTooltip({ step: "Redaction Settings" }),
};

export const AdvancedTooltip: Story = {
  play: openTooltip({ step: "Advanced" }),
};

export const WordsToRedactTooltip: Story = {
  play: openTooltip({ info: "Examples: Confidential, Top-Secret" }),
};

export const ConvertToImageTooltip: Story = {
  play: openTooltip({ info: /^Converts the PDF to an image-based PDF/ }),
};

export const ManualRedactionControlsTooltip: Story = {
  args: manualMode,
  play: openTooltip({ step: "Manual Redaction Controls" }),
};

export const RedactionToolsTooltip: Story = {
  args: manualMode,
  play: openTooltip({ info: /^Select text or draw areas on the PDF/ }),
};

export const AutomaticUnavailableTooltip: Story = {
  args: noFiles,
  play: openTooltip({
    element: async (context) => {
      const panel = within(await waitForToolPanel(context));
      const automatic = await panel.findByRole(
        "radio",
        { name: "Automatic" },
        STAGE_TIMEOUT,
      );
      await waitFor(() => expect(automatic).toBeDisabled());
      return within(automatic.parentElement!).getByText("Automatic");
    },
  }),
};
