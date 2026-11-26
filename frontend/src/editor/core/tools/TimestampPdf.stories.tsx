import type { StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import {
  appConfig,
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  findEnabled,
  openSelect,
  openTooltip,
  runToResults,
  selectOption,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Timestamp PDF/Panel",
  ...toolPanelMeta("timestampPdf"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const ADMIN_TSA_URL = "https://tsa.example.com/tsr";

const adminTsaServers = toolPanelServer(
  appConfig({
    timestampCustomTsaUrls: [ADMIN_TSA_URL, "http://timestamp.digicert.com"],
    timestampDefaultTsaUrl: ADMIN_TSA_URL,
  }),
);

const TSA_SERVER = /^Timestamp server/;

export const Panel: Story = {
  play: async (context) => {
    await expect(await findEnabled(context, "textbox", TSA_SERVER)).toHaveValue(
      "DigiCert",
    );
  },
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const TimestampServerTooltip: Story = {
  play: openTooltip({ info: /^Only a SHA-256 hash of your document/ }),
};

export const TsaServerMenu: Story = {
  play: async (context) => {
    const menu = await openSelect(context, TSA_SERVER);
    await expect(menu.getAllByRole("option")).toHaveLength(5);
  },
};

export const TsaServerChosen: Story = {
  play: async (context) => {
    await selectOption(context, TSA_SERVER, "FreeTSA");
  },
};

export const AdminTsaServers: Story = {
  parameters: adminTsaServers,
  play: async (context) => {
    const select = await findEnabled(context, "textbox", TSA_SERVER);
    await waitFor(() => expect(select).toHaveValue(ADMIN_TSA_URL));
    const menu = await openSelect(context, TSA_SERVER);
    await expect(menu.getAllByRole("option")).toHaveLength(6);
  },
};

const timestampsSample = toolPanelServer(
  fixtureResponse("/api/v1/security/timestamp-pdf", "sample.pdf"),
);

export const Results: Story = {
  parameters: timestampsSample,
  play: runToResults,
};

export const UndoTooltip: Story = {
  parameters: timestampsSample,
  play: openTooltip({ info: "Undo" }, { after: runToResults }),
};
