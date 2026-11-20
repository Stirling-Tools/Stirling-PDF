import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import {
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  runTool,
  STAGE_TIMEOUT,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import {
  AUTO_ROTATE_ENDPOINT,
  type AutoRotateReport,
} from "@editor/hooks/tools/autoRotate/useAutoRotateOperation";

const meta = {
  title: "Tools/Auto Rotate/Panel",
  ...toolPanelMeta("autoRotate", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

const REPORT: AutoRotateReport = {
  pages: [
    {
      pageNumber: 1,
      currentRotation: 0,
      correction: 0,
      confidence: 98.4,
      method: "text",
      apply: false,
    },
    {
      pageNumber: 2,
      currentRotation: 0,
      correction: 0,
      confidence: 6.2,
      method: "osd",
      apply: false,
      note: "belowThreshold",
    },
    {
      pageNumber: 3,
      currentRotation: 0,
      correction: 0,
      confidence: null,
      method: "none",
      apply: false,
      note: "blankPage",
    },
  ],
  totalPages: 3,
  pagesToRotate: 0,
  detectedByText: 1,
  detectedByOsd: 1,
  inferred: 0,
  undetected: 1,
};

export const Panel: Story = {};

export const DetectionReport: Story = {
  parameters: toolPanelServer(
    http.post(`*${AUTO_ROTATE_ENDPOINT}`, () => HttpResponse.json(REPORT)),
  ),
  play: async (context) => {
    const panel = await runTool(context);
    await panel.findByText("Detection report", undefined, STAGE_TIMEOUT);
  },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};
