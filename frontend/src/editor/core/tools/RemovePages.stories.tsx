import type { StoryObj } from "@storybook/react-vite";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  findEnabled,
  openTooltip,
  type PlayContext,
  runToResults,
  typeInto,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Remove Pages/Panel",
  ...toolPanelMeta("removePages", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

function enterPages(pages: string) {
  return (context: PlayContext) => typeInto(context, /^Pages to Remove/, pages);
}

export const Panel: Story = {};

export const InvalidPageNumbers: Story = {
  play: async (context) => {
    await enterPages("1-3,x")(context);
    await waitForPanelText(context, /^Invalid page number format/);
  },
};

export const ValidPageNumbers: Story = {
  play: async (context) => {
    await enterPages("1,3,5-8")(context);
    await findEnabled(context, "button", /^Remove Pages/);
  },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const PagesRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/general/remove-pages", "sample.pdf"),
  ),
  play: async (context) => {
    await enterPages("1")(context);
    await runToResults(context);
  },
};
