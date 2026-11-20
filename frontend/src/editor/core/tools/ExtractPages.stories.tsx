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
  title: "Tools/Extract Pages/Panel",
  ...toolPanelMeta("extractPages", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

function enterPages(pages: string) {
  return (context: PlayContext) =>
    typeInto(context, /^Pages to Extract/, pages);
}

export const Panel: Story = {};

export const SyntaxError: Story = {
  play: async (context) => {
    await enterPages("1-3,x")(context);
    await waitForPanelText(context, /^There is a syntax issue/);
  },
};

export const ValidSelection: Story = {
  play: async (context) => {
    await enterPages("odd & 1-10")(context);
    await findEnabled(context, "button", /^Extract Pages/);
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
    fixtureResponse("/api/v1/general/rearrange-pages", "sample.pdf"),
  ),
  play: async (context) => {
    await enterPages("1-2")(context);
    await runToResults(context);
  },
};
