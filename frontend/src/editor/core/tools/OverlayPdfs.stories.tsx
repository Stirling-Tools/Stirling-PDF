import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  choose,
  findEnabled,
  openSelect,
  openTooltip,
  type PlayContext,
  selectOption,
  STAGE_TIMEOUT,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { loadFixture } from "@editor/components/tools/toolPanelStory/fixtures";

const meta = {
  title: "Tools/Overlay PDFs/Panel",
  ...toolPanelMeta("overlayPdfs", {
    files: ["compare_sample_a.pdf", "compare_sample_b.pdf"],
    filesModal: true,
  }),
};
export default meta;

type Story = StoryObj<typeof meta>;

const OVERLAY_MODE = "Overlay Mode";

function pickOverlayMode(mode: string) {
  return (context: PlayContext) => selectOption(context, OVERLAY_MODE, mode);
}

const fixedRepeat = pickOverlayMode("Fixed Repeat Overlay");

/** The Files modal lists the server's processing folders beside the library. */
const noProcessingFolders = http.get("*/api/v1/processing-folders", () =>
  HttpResponse.json([]),
);

/**
 * Adds sample.pdf as an overlay the way a user picks it from their computer in
 * the Files modal: through the modal's own file input, then its Add button.
 */
async function addOverlayFile(context: PlayContext) {
  await userEvent.click(
    await findEnabled(context, "button", "Choose PDF(s)..."),
  );
  const body = bodyOf(context);
  const fromComputer = await body.findByRole(
    "button",
    { name: "From your computer" },
    STAGE_TIMEOUT,
  );
  // The button opens the native picker through this hidden input.
  const input = fromComputer.parentElement?.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement))
    throw new Error("The Files modal has no file input");
  await userEvent.upload(input, await loadFixture("sample.pdf"));
  const add = await body.findByRole(
    "button",
    { name: /^Add 1 file/ },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(add).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(add);
  await waitFor(
    () => expect(body.queryByRole("dialog")).toBeNull(),
    STAGE_TIMEOUT,
  );
  return waitForPanelText(context, "sample.pdf");
}

export const Panel: Story = {};

export const OverlayModeOptions: Story = {
  play: async (context) => {
    const modes = await openSelect(context, OVERLAY_MODE);
    await expect(
      modes.getByRole("option", { name: "Fixed Repeat Overlay" }),
    ).toBeVisible();
  },
};

export const InterleavedOverlay: Story = {
  play: pickOverlayMode("Interleaved Overlay"),
};

export const FixedRepeatOverlay: Story = {
  play: async (context) => {
    await fixedRepeat(context);
    await waitForPanelText(context, "Add overlay files to configure counts");
  },
};

export const BackgroundPosition: Story = {
  play: async (context) => {
    await choose(context, "Background");
  },
};

export const OverlayFilesAdded: Story = {
  parameters: toolPanelServer(noProcessingFolders),
  play: async (context) => {
    const panel = await addOverlayFile(context);
    await expect(panel.getByRole("button", { name: "Remove" })).toBeVisible();
    await findEnabled(context, "button", "Add more PDFs...");
  },
};

export const FixedRepeatWithCounts: Story = {
  parameters: toolPanelServer(noProcessingFolders),
  play: async (context) => {
    await fixedRepeat(context);
    const panel = await addOverlayFile(context);
    await expect(panel.getByText("Count for file 1")).toBeVisible();
  },
};

export const SettingsTooltip: Story = {
  // The tooltip's body scrolls but cannot take keyboard focus.
  parameters: knownA11yIssues("scrollable-region-focusable"),
  play: openTooltip({ step: "Settings" }),
};

export const OverlayModeTooltip: Story = {
  play: openTooltip({ info: /^Choose how to distribute overlay pages/ }),
};

export const OverlayPositionTooltip: Story = {
  play: openTooltip({ info: /^Foreground places the overlay on top/ }),
};

export const OverlayCountsTooltip: Story = {
  play: openTooltip(
    { info: /^Provide a positive number for each overlay file/ },
    { after: fixedRepeat },
  ),
};

export const OverlayFilesTooltip: Story = {
  play: openTooltip({ info: /^Select one or more PDFs to overlay/ }),
};

export const OverlayFilesRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};
