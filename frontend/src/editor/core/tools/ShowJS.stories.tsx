import type { StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { http, HttpResponse } from "msw";
import {
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  runTool,
  STAGE_TIMEOUT,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Show Javascript/Panel",
  ...toolPanelMeta("showJS"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const Result: Story = {
  parameters: toolPanelServer(
    http.post("*/api/v1/misc/show-javascript", () =>
      HttpResponse.text('function onOpen() { app.alert("hi"); }'),
    ),
  ),
  play: async (context) => {
    const panel = await runTool(context);
    await panel.findByText("Review", undefined, STAGE_TIMEOUT);
    await expect(
      await panel.findByRole("button", { name: "Back" }, STAGE_TIMEOUT),
    ).toBeEnabled();
  },
};
