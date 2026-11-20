import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  choose,
  findEnabled,
  openTooltip,
  type PlayContext,
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

/**
 * The mode Select has no accessible name, so it is found by the value it
 * shows rather than through openSelect.
 */
async function openOverlayModes(context: PlayContext) {
  const panel = await waitForPanelText(context, "Select Overlay Mode");
  const mode = panel.getByDisplayValue("Sequential Overlay");
  await waitFor(() => expect(mode).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(mode);
  return within(await bodyOf(context).findByRole("listbox", {}, STAGE_TIMEOUT));
}

function pickOverlayMode(mode: string) {
  return async (context: PlayContext) => {
    const modes = await openOverlayModes(context);
    await userEvent.click(modes.getByRole("option", { name: mode }));
    const panel = await waitForPanelText(context, "Select Overlay Mode");
    await expect(panel.getByDisplayValue(mode)).toBeVisible();
    return panel;
  };
}

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

export const Panel: Story = {
  // The overlay mode Select has no label.
  parameters: knownA11yIssues("label"),
};

export const OverlayModeOptions: Story = {
  // The mode Select has no label, and so neither has its listbox.
  parameters: knownA11yIssues("label", "aria-input-field-name"),
  play: async (context) => {
    const modes = await openOverlayModes(context);
    await expect(
      modes.getByRole("option", { name: "Fixed Repeat Overlay" }),
    ).toBeVisible();
  },
};

export const InterleavedOverlay: Story = {
  // The overlay mode Select has no label.
  parameters: knownA11yIssues("label"),
  play: pickOverlayMode("Interleaved Overlay"),
};

export const FixedRepeatOverlay: Story = {
  // The overlay mode Select has no label.
  parameters: knownA11yIssues("label"),
  play: async (context) => {
    await pickOverlayMode("Fixed Repeat Overlay")(context);
    await waitForPanelText(context, "Add overlay files to configure counts");
  },
};

export const BackgroundPosition: Story = {
  // The overlay mode Select has no label.
  parameters: knownA11yIssues("label"),
  play: async (context) => {
    await choose(context, "Background");
  },
};

export const OverlayFilesAdded: Story = {
  parameters: {
    ...toolPanelServer(noProcessingFolders),
    // The overlay mode Select has no label.
    ...knownA11yIssues("label"),
  },
  play: async (context) => {
    const panel = await addOverlayFile(context);
    await expect(panel.getByRole("button", { name: "Remove" })).toBeVisible();
    await findEnabled(context, "button", "Add more PDFs...");
  },
};

export const FixedRepeatWithCounts: Story = {
  parameters: {
    ...toolPanelServer(noProcessingFolders),
    // The mode Select and each file's count field have no label.
    ...knownA11yIssues("label"),
  },
  play: async (context) => {
    await pickOverlayMode("Fixed Repeat Overlay")(context);
    const panel = await addOverlayFile(context);
    await expect(panel.getByText("Count for file 1")).toBeVisible();
  },
};

export const SettingsTooltip: Story = {
  // The mode Select has no label; the tooltip's body scrolls but cannot take
  // keyboard focus.
  parameters: knownA11yIssues("label", "scrollable-region-focusable"),
  play: openTooltip({ step: "Settings" }),
};

export const OverlayFilesRequiredTooltip: Story = {
  // The overlay mode Select has no label.
  parameters: knownA11yIssues("label"),
  play: openTooltip({ runButton: true }),
};
