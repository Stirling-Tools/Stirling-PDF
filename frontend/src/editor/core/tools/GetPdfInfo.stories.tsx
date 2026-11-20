import type { StoryObj } from "@storybook/react-vite";
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
  title: "Tools/Get all info on PDF/Panel",
  ...toolPanelMeta("getPdfInfo"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const PDF_INFO = {
  Metadata: { Title: "Sample", Author: "Stirling-PDF", PageCount: 1 },
  BasicInfo: { FileSizeInBytes: 12345, PdfVersion: "1.7" },
};

export const Panel: Story = {};

export const Report: Story = {
  parameters: toolPanelServer(
    http.post("*/api/v1/security/get-info-on-pdf", () =>
      HttpResponse.json(PDF_INFO),
    ),
  ),
  play: async (context) => {
    const panel = await runTool(context);
    await panel.findByRole("button", { name: "Download JSON" }, STAGE_TIMEOUT);
  },
};
