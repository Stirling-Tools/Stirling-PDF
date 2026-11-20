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
    label: "Angle Threshold:",
    value: "10",
    description: /^Tilt \(in degrees\) needed/,
  },
  {
    label: "Tolerance:",
    value: "30",
    description: /^How closely a color must match/,
  },
  {
    label: "Minimum Area:",
    value: "10000",
    description: /^Smallest photo size/,
  },
  {
    label: "Minimum Contour Area:",
    value: "500",
    description: /^Smallest edge\/shape/,
  },
  { label: "Border Size:", value: "1", description: /^Extra padding/ },
];

/** Types into a settings field and leaves it, which is when the panel commits it. */
async function enterSetting(
  context: PlayContext,
  label: string,
  value: string,
) {
  const input = await typeInto(context, label, value);
  await userEvent.tab();
  return input;
}

export const Panel: Story = {
  play: async (context) => {
    const panel = await waitForPanelText(context, "Angle Threshold:");
    for (const { label, value, description } of FIELDS) {
      await expect(panel.getByRole("textbox", { name: label })).toHaveValue(
        value,
      );
      await expect(panel.getByText(description)).toBeVisible();
    }
  },
};

export const CustomSettings: Story = {
  play: async (context) => {
    for (const [label, value] of [
      ["Angle Threshold:", "5"],
      ["Tolerance:", "45"],
      ["Minimum Area:", "15000"],
      ["Minimum Contour Area:", "1500"],
      ["Border Size:", "8"],
    ] as const) {
      const input = await enterSetting(context, label, value);
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

/** The field reads 0, but the settings take 0 as empty and send the default. */
export const ZeroBorderSize: Story = {
  parameters: recordsBorderSize,
  play: async (context) => {
    sentBorderSize = null;
    const input = await enterSetting(context, "Border Size:", "0");
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

export const NoFiles: Story = {
  args: { files: [] },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  parameters: toolPanelServer(fixtureResponse(ENDPOINT, "sample.png")),
  play: runToResults,
};
