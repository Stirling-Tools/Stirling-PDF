import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { expect, waitFor } from "storybook/test";
import {
  endpointUnavailable,
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  findEnabled,
  openTooltip,
  panelOf,
  type PlayContext,
  runTool,
  STAGE_TIMEOUT,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type { DetectionSummary } from "@editor/services/formDetection/progress";

const DETECT_ENDPOINT = "/api/v1/form/form-detection/detect";

const meta = {
  title: "Tools/Auto Form Detection/Panel",
  ...toolPanelMeta("autoFormDetection"),
};
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * An unavailable detector. The desktop app in local mode offers to sign in
 * instead of disabling the run button.
 */
const OFFERS_SIGN_IN_ON_DESKTOP = ["not-in-desktop"];
type Play = NonNullable<Story["play"]>;

function detectionResponse(summary: DetectionSummary) {
  return fixtureResponse(DETECT_ENDPOINT, "form-fields-sample.pdf", {
    "X-Stirling-Detected-Fields": JSON.stringify(summary),
  });
}

function detectsUntil(text: string): Play {
  return async (context) => {
    await runTool(context);
    await waitForPanelText(context, text);
  };
}

const BALANCED_HINT = "Recommended for most forms.";
const STRICT_HINT =
  "Only very confident matches - fewer fields, fewer mistakes.";
const THOROUGH_HINT = "Finds more fields, but may add some where none belong.";

function withSensitivity(option: string, hint: string) {
  return async (context: PlayContext): Promise<void> => {
    await choose(context, option);
    await findEnabled(context, "button", hint);
  };
}

export const Panel: Story = {
  play: async (context) => {
    await findEnabled(context, "button", BALANCED_HINT);
  },
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const BalancedSensitivityTooltip: Story = {
  play: openTooltip({ info: BALANCED_HINT }),
};

export const StrictSensitivity: Story = {
  play: withSensitivity("Strict", STRICT_HINT),
};

export const StrictSensitivityTooltip: Story = {
  play: openTooltip(
    { info: STRICT_HINT },
    { after: withSensitivity("Strict", STRICT_HINT) },
  ),
};

export const ThoroughSensitivity: Story = {
  play: withSensitivity("Thorough", THOROUGH_HINT),
};

export const ThoroughSensitivityTooltip: Story = {
  play: openTooltip(
    { info: THOROUGH_HINT },
    { after: withSensitivity("Thorough", THOROUGH_HINT) },
  ),
};

export const Detecting: Story = {
  parameters: toolPanelServer(
    http.post(`*${DETECT_ENDPOINT}`, async () => {
      await delay("infinite");
      return new HttpResponse(null);
    }),
  ),
  play: detectsUntil("Analyzing your document..."),
};

export const DetectionResults: Story = {
  parameters: toolPanelServer(
    detectionResponse({
      total: 9,
      byType: { text: 4, checkbox: 2, radio: 2, signature: 1 },
      pagesWithFields: 2,
    }),
  ),
  play: detectsUntil("Across 2 pages."),
};

export const DetectionResultsOnePage: Story = {
  parameters: toolPanelServer(
    detectionResponse({
      total: 3,
      byType: { text: 3 },
      pagesWithFields: 1,
    }),
  ),
  play: detectsUntil("3 fillable fields added"),
};

export const NoFieldsDetected: Story = {
  parameters: toolPanelServer(
    detectionResponse({ total: 0, byType: {}, pagesWithFields: 0 }),
  ),
  play: detectsUntil("No form fields found"),
};

export const ResultsWithoutSummary: Story = {
  parameters: toolPanelServer(
    fixtureResponse(DETECT_ENDPOINT, "form-fields-sample.pdf"),
  ),
  play: async (context) => {
    const panel = await runTool(context);
    await panel.findByRole("button", { name: "Undo" }, STAGE_TIMEOUT);
    await expect(panel.queryByText("Detection results")).toBeNull();
  },
};

/**
 * A failure with no message from the server shows the client's own wording,
 * which the desktop app words differently from the web's.
 */
export const DetectionFailed: Story = {
  tags: ["not-in-desktop"],
  parameters: toolPanelServer(
    http.post(`*${DETECT_ENDPOINT}`, () =>
      HttpResponse.json(null, { status: 500 }),
    ),
  ),
  play: detectsUntil("Request failed with status code 500"),
};

async function waitUntilUnavailable(context: PlayContext): Promise<void> {
  const panel = await panelOf(context);
  await waitFor(
    () =>
      expect(
        panel.getByRole("button", { name: "Detect form fields" }),
      ).toBeDisabled(),
    STAGE_TIMEOUT,
  );
}

export const Unavailable: Story = {
  tags: OFFERS_SIGN_IN_ON_DESKTOP,
  play: waitUntilUnavailable,
  parameters: toolPanelServer(...endpointUnavailable("form-detection")),
};

export const UnavailableTooltip: Story = {
  tags: OFFERS_SIGN_IN_ON_DESKTOP,
  parameters: Unavailable.parameters,
  play: openTooltip({ runButton: true }, { after: waitUntilUnavailable }),
};
