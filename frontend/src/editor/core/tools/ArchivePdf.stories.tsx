import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect } from "storybook/test";
import {
  endpointUnavailable,
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  findEnabled,
  openSelect,
  openTooltip,
  runTool,
  runToResults,
  STAGE_TIMEOUT,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Prepare for Archive/Panel",
  ...toolPanelMeta("archivePdf"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const ENDPOINT = "/api/v1/convert/pdf/pdfa";
const PDFA_VERSION = /^PDF\/A version/;
const STRICT_MODE = /^Strict mode/;

/**
 * Runs the conversion, which needs an account in the desktop app's local mode:
 * the run button asks the user to sign in instead.
 */
const NEEDS_ACCOUNT_ON_DESKTOP = ["not-in-desktop"];

export const Panel: Story = {
  play: async (context) => {
    await expect(
      await findEnabled(context, "textbox", PDFA_VERSION),
    ).toHaveValue("PDF/A-2b");
    await expect(
      await findEnabled(context, "checkbox", STRICT_MODE),
    ).not.toBeChecked();
  },
};

export const OutputFormats: Story = {
  play: async (context) => {
    const formats = await openSelect(context, PDFA_VERSION);
    await formats.findByRole("option", { name: "PDF/A-2a (accessible)" });
  },
};

export const OutputFormatsWithoutTagging: Story = {
  parameters: toolPanelServer(...endpointUnavailable("pdf-to-ua")),
  play: async (context) => {
    const formats = await openSelect(context, PDFA_VERSION);
    await formats.findByRole("option", { name: "PDF/A-3b" });
    await expect(
      formats.queryByRole("option", { name: /accessible/ }),
    ).toBeNull();
  },
};

export const SignedPdf: Story = {
  args: { files: ["signed-sample.pdf"] },
  play: async (context) => {
    await waitForPanelText(context, /digitally signed/);
  },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const OutputFormatTooltip: Story = {
  play: openTooltip({ info: /^PDF\/A-2b suits most archives/ }),
};

export const StrictModeTooltip: Story = {
  play: openTooltip({ info: /^Fails instead of returning/ }),
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  tags: NEEDS_ACCOUNT_ON_DESKTOP,
  parameters: toolPanelServer(fixtureResponse(ENDPOINT, "sample.pdf")),
  play: runToResults,
};

export const ConversionFailed: Story = {
  tags: NEEDS_ACCOUNT_ON_DESKTOP,
  parameters: toolPanelServer(
    http.post(`*${ENDPOINT}`, () =>
      HttpResponse.json({ error: "Conversion failed" }, { status: 500 }),
    ),
  ),
  play: async (context) => {
    const panel = await runTool(context);
    await expect(
      await panel.findByRole("alert", undefined, STAGE_TIMEOUT),
    ).toBeVisible();
  },
};
