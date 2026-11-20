import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, type RequestHandler } from "msw";
import { expect, waitFor, within } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  runTool,
  waitForPanelText,
  waitForToolPanel,
  type PlayContext,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Compress/Panel",
  ...toolPanelMeta("compress"),
};
export default meta;

type Story = StoryObj<typeof meta>;

function imageMagickEnabled(enabled: boolean, ...handlers: RequestHandler[]) {
  return toolPanelServer(
    ...handlers,
    http.get("*/api/v1/config/group-enabled", ({ request }) =>
      new URL(request.url).searchParams.get("group") === "ImageMagick"
        ? HttpResponse.json(enabled)
        : undefined,
    ),
  );
}

export const Panel: Story = {
  parameters: imageMagickEnabled(true),
};

export const FileSize: Story = {
  args: { parameters: { compressionMethod: "filesize" } },
  parameters: imageMagickEnabled(true),
};

export const LineArt: Story = {
  args: { parameters: { lineArt: true } },
  parameters: imageMagickEnabled(true),
};

export const LineArtUnavailable: Story = {
  args: { parameters: { lineArt: true } },
  parameters: imageMagickEnabled(false),
};

export const SettingsTooltip: Story = {
  parameters: imageMagickEnabled(true),
  play: openTooltip({ step: "Settings" }),
};

export const LineArtTooltip: Story = {
  parameters: imageMagickEnabled(true),
  play: openTooltip({ info: /Uses ImageMagick/ }),
};

export const LineArtUnavailableTooltip: Story = {
  parameters: imageMagickEnabled(false),
  play: openTooltip({
    element: async (context) => {
      const panel = within(await waitForToolPanel(context));
      const checkbox = await panel.findByRole("checkbox", {
        name: "Convert images to line art",
      });
      await waitFor(() => expect(checkbox).toBeDisabled());
      return checkbox.closest<HTMLElement>(".mantine-Checkbox-root")!
        .parentElement!;
    },
  }),
};

export const FileSizeRequiredTooltip: Story = {
  args: { parameters: { compressionMethod: "filesize" } },
  parameters: imageMagickEnabled(true),
  play: openTooltip({ runButton: true }),
};

const compressesToSameSize = imageMagickEnabled(
  true,
  fixtureResponse("/api/v1/misc/compress-pdf", "sample.pdf"),
);

async function runWithNoReduction(context: PlayContext) {
  await runTool(context);
  await waitForPanelText(
    context,
    /made no improvement|can't be compressed any further/,
  );
}

export const NoReduction: Story = {
  parameters: compressesToSameSize,
  play: runWithNoReduction,
};

export const UndoOperationTooltip: Story = {
  parameters: compressesToSameSize,
  play: openTooltip({ info: "Undo" }, { after: runWithNoReduction }),
};
