import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { expect, waitFor, within } from "storybook/test";
import {
  endpointUnavailable,
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  type PlayContext,
  runTool,
  STAGE_TIMEOUT,
  waitForPanelText,
  waitForToolPanel,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type { DetectionSummary } from "@editor/services/formDetection/progress";

const DETECT_ENDPOINT = "/api/v1/form/form-detection/detect";

const meta = {
  title: "Tools/Auto Form Detection/Panel",
  ...toolPanelMeta("autoFormDetection"),
};
export default meta;

type Story = StoryObj<typeof meta>;

function detectionResponse(summary: DetectionSummary) {
  return fixtureResponse(DETECT_ENDPOINT, "form-fields-sample.pdf", {
    "X-Stirling-Detected-Fields": JSON.stringify(summary),
  });
}

type Play = NonNullable<Story["play"]>;

function detectsUntil(text: string): Play {
  return async (context) => {
    await runTool(context);
    await waitForPanelText(context, text);
  };
}

export const Panel: Story = {};

export const Detecting: Story = {
  parameters: toolPanelServer(
    http.post(DETECT_ENDPOINT, async () => {
      await delay("infinite");
      return new HttpResponse(null);
    }),
  ),
  play: detectsUntil("Analyzing your document..."),
};

export const DetectionResults: Story = {
  parameters: toolPanelServer(
    detectionResponse({
      total: 7,
      byType: { text: 4, checkbox: 2, signature: 1 },
      pagesWithFields: 2,
    }),
  ),
  play: detectsUntil("7 fillable fields added"),
};

export const NoFieldsDetected: Story = {
  parameters: toolPanelServer(
    detectionResponse({ total: 0, byType: {}, pagesWithFields: 0 }),
  ),
  play: detectsUntil("No form fields found"),
};

async function waitUntilUnavailable(context: PlayContext): Promise<void> {
  const panel = within(await waitForToolPanel(context));
  await waitFor(
    () =>
      expect(
        panel.getByRole("button", { name: "Detect form fields" }),
      ).toBeDisabled(),
    STAGE_TIMEOUT,
  );
}

export const Unavailable: Story = {
  play: waitUntilUnavailable,
  parameters: toolPanelServer(...endpointUnavailable("form-detection")),
};

export const BalancedSensitivityTooltip: Story = {
  play: openTooltip({ info: "Recommended for most forms." }),
};

export const StrictSensitivityTooltip: Story = {
  args: { parameters: { sensitivity: "low" } },
  play: openTooltip({ info: /Only very confident matches/ }),
};

export const ThoroughSensitivityTooltip: Story = {
  args: { parameters: { sensitivity: "high" } },
  play: openTooltip({ info: /Finds more fields/ }),
};

export const UnavailableTooltip: Story = {
  parameters: Unavailable.parameters,
  play: openTooltip({ runButton: true }, { after: waitUntilUnavailable }),
};
