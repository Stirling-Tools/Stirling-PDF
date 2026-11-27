import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  findEnabled,
  openStep,
  openTooltip,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
  waitForPanelText,
  waitForToolPanel,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Rotate/Panel",
  ...toolPanelMeta("rotate"),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** The desktop app labels the result's Download button "Save". */
const DOWNLOADS_RESULT = ["not-in-desktop"];

async function expectPreviewAngle(context: PlayContext, degrees: number) {
  const panel = await waitForToolPanel(context);
  // The preview exposes its angle only as an inline transform.
  await waitFor(
    () =>
      expect(
        panel.querySelector(`[style*="rotate(${degrees}deg)"]`),
      ).not.toBeNull(),
    STAGE_TIMEOUT,
  );
}

async function rotate(context: PlayContext, direction: string) {
  await waitForPanelText(context, "Rotation Preview");
  await userEvent.click(await findEnabled(context, "button", direction));
}

export const Panel: Story = {};

export const RotatedClockwise: Story = {
  play: async (context) => {
    await rotate(context, "Rotate Clockwise");
    await expectPreviewAngle(context, 90);
  },
};

export const RotatedCounterclockwise: Story = {
  play: async (context) => {
    await rotate(context, "Rotate Counterclockwise");
    await expectPreviewAngle(context, -90);
  },
};

export const RotatedWithArrowKeys: Story = {
  play: async (context) => {
    await waitForPanelText(context, "Rotation Preview");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await expectPreviewAngle(context, 180);
    await userEvent.keyboard("{ArrowLeft}");
    await expectPreviewAngle(context, 90);
  },
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

async function rotateAndRun(context: PlayContext) {
  await rotate(context, "Rotate Clockwise");
  const panel = await runToResults(context);
  await expect(
    await panel.findByRole("button", { name: "Download" }, STAGE_TIMEOUT),
  ).toBeVisible();
}

const rotatedSample = toolPanelServer(
  fixtureResponse("/api/v1/general/rotate-pdf", "sample.pdf"),
);

export const Results: Story = {
  tags: DOWNLOADS_RESULT,
  parameters: rotatedSample,
  play: rotateAndRun,
};

export const ResultsReopenSettings: Story = {
  tags: DOWNLOADS_RESULT,
  parameters: rotatedSample,
  play: async (context) => {
    await rotateAndRun(context);
    const panel = await openStep(context, "Settings");
    await expect(
      await panel.findByRole(
        "button",
        { name: /^Apply Rotation/ },
        STAGE_TIMEOUT,
      ),
    ).toBeVisible();
  },
};
