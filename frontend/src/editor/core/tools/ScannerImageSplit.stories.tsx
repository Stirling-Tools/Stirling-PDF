import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  getInfoButton,
  openTooltip,
  type PlayContext,
  runToResults,
  typeInto,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { loadFixture } from "@editor/components/tools/toolPanelStory/fixtures";

const meta = {
  title: "Tools/Detect & Split Scanned Photos/Panel",
  ...toolPanelMeta("scannerImageSplit", { files: ["scanned-no-ocr.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

const ENDPOINT = "/api/v1/misc/extract-image-scans";

const FIELDS = [
  {
    label: /^Angle Threshold/,
    value: "10",
    info: /^Tilt \(in degrees\) needed/,
  },
  {
    label: /^Tolerance/,
    value: "30",
    info: /^How closely a color must match/,
  },
  {
    label: /^Minimum Area/,
    value: "10000",
    info: /^Smallest photo size/,
  },
  {
    label: /^Minimum Contour Area/,
    value: "500",
    info: /^Smallest edge\/shape/,
  },
  { label: /^Border Size/, value: "1", info: /^Extra padding/ },
] as const;

const [ANGLE, TOLERANCE, MIN_AREA, MIN_CONTOUR_AREA, BORDER_SIZE] = FIELDS;

/** Types into a settings field and leaves it, which is when the panel commits it. */
async function enterSetting(
  context: PlayContext,
  label: RegExp,
  value: string,
) {
  const input = await typeInto(context, label, value);
  await userEvent.tab();
  return input;
}

export const Panel: Story = {
  play: async (context) => {
    const panel = await waitForPanelText(context, "Angle Threshold");
    for (const { label, value, info } of FIELDS) {
      await expect(panel.getByRole("textbox", { name: label })).toHaveValue(
        value,
      );
      await expect(getInfoButton(panel, info)).toBeVisible();
    }
  },
};

export const CustomSettings: Story = {
  play: async (context) => {
    for (const [field, value] of [
      [ANGLE, "5"],
      [TOLERANCE, "45"],
      [MIN_AREA, "15000"],
      [MIN_CONTOUR_AREA, "1500"],
      [BORDER_SIZE, "8"],
    ] as const) {
      const input = await enterSetting(context, field.label, value);
      await waitFor(() => expect(input).toHaveValue(value));
    }
  },
};

let sentBorderSize: FormDataEntryValue | null = null;

const recordsBorderSize = toolPanelServer(
  http.post(`*${ENDPOINT}`, async ({ request }) => {
    sentBorderSize = (await request.formData()).get("borderSize");
    const image = await loadFixture("sample.png");
    return new HttpResponse(image, { headers: { "Content-Type": image.type } });
  }),
);

/**
 * Runs the split, which needs an account in the desktop app's local mode: the
 * run button asks the user to sign in instead.
 */
const NEEDS_ACCOUNT_ON_DESKTOP = ["not-in-desktop"];

/** The field reads 0, but the settings take 0 as empty and send the default. */
export const ZeroBorderSize: Story = {
  tags: NEEDS_ACCOUNT_ON_DESKTOP,
  parameters: recordsBorderSize,
  play: async (context) => {
    sentBorderSize = null;
    const input = await enterSetting(context, BORDER_SIZE.label, "0");
    await expect(input).toHaveValue("0");
    await runToResults(context);
    await expect(sentBorderSize).toBe("1");
  },
};

export const SettingsTooltip: Story = {
  // The tooltip's body scrolls but cannot take keyboard focus.
  parameters: knownA11yIssues("scrollable-region-focusable"),
  play: openTooltip({ step: "Settings" }),
};

export const AngleThresholdTooltip: Story = {
  play: openTooltip({ info: ANGLE.info }),
};

export const ToleranceTooltip: Story = {
  play: openTooltip({ info: TOLERANCE.info }),
};

export const MinimumAreaTooltip: Story = {
  play: openTooltip({ info: MIN_AREA.info }),
};

export const MinimumContourAreaTooltip: Story = {
  play: openTooltip({ info: MIN_CONTOUR_AREA.info }),
};

export const BorderSizeTooltip: Story = {
  play: openTooltip({ info: BORDER_SIZE.info }),
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
  parameters: toolPanelServer(fixtureResponse(ENDPOINT, "sample.png")),
  play: runToResults,
};
