import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  untilPanelShows,
  STAGE_TIMEOUT,
  waitForPanelText,
  waitForToolPanel,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/OCR & Cleanup scans/Panel",
  ...toolPanelMeta("ocr", { files: ["scanned-no-ocr.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** The OCR languages the server has installed; the picker preselects the browser's when it is one. */
const installedLanguages = (languages: string[]) =>
  toolPanelServer(
    http.get("*/api/v1/ui-data/ocr-pdf", () =>
      HttpResponse.json({ languages }),
    ),
  );

const WITH_ENGLISH = installedLanguages(["eng", "deu", "fra", "spa"]);
const WITHOUT_ENGLISH = installedLanguages(["deu", "fra", "spa"]);

export const Panel: Story = {
  parameters: WITH_ENGLISH,
  play: untilPanelShows("English"),
};

export const NoLanguageSelected: Story = {
  parameters: WITHOUT_ENGLISH,
  play: untilPanelShows("Select languages"),
};

export const OcrModeOptions: Story = {
  parameters: WITH_ENGLISH,
  play: async (context) => {
    const panel = within(await waitForToolPanel(context));
    const mode = await panel.findByRole(
      "textbox",
      { name: "OCR Mode" },
      STAGE_TIMEOUT,
    );
    await waitFor(() => expect(mode).toBeEnabled(), STAGE_TIMEOUT);
    await userEvent.click(mode);
    await within(context.canvasElement.ownerDocument.body).findByRole(
      "option",
      { name: "Strict (abort if text found)" },
      STAGE_TIMEOUT,
    );
  },
};

export const LanguageOptions: Story = {
  parameters: WITH_ENGLISH,
  play: async (context) => {
    const panel = await waitForPanelText(context, "English");
    await userEvent.click(panel.getByRole("button", { name: "English" }));
    await within(context.canvasElement.ownerDocument.body).findByText(
      "Looking for additional languages?",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const SettingsTooltip: Story = {
  parameters: WITH_ENGLISH,
  play: openTooltip({ step: "Settings" }),
};

export const AdvancedTooltip: Story = {
  parameters: WITH_ENGLISH,
  play: openTooltip({ step: "Advanced" }),
};

export const LanguageRequiredTooltip: Story = {
  parameters: WITHOUT_ENGLISH,
  play: openTooltip({ runButton: true }),
};
