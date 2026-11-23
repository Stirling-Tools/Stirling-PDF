import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, type RequestHandler } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  findEnabled,
  getInfoButton,
  openSelect,
  openTooltip,
  panelOf,
  type PlayContext,
  queryInfoButton,
  runTool,
  runToResults,
  selectOption,
  STAGE_TIMEOUT,
  toggle,
  typeInto,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type { FixtureName } from "@editor/components/tools/toolPanelStory/fixtures";

const meta = {
  title: "Tools/Compress/Panel",
  ...toolPanelMeta("compress"),
};
export default meta;

type Story = StoryObj<typeof meta>;

function lineArtEnabled(enabled: boolean, ...handlers: RequestHandler[]) {
  return toolPanelServer(
    ...handlers,
    http.get("*/api/v1/config/group-enabled", ({ request }) =>
      new URL(request.url).searchParams.get("group") === "LineArt"
        ? HttpResponse.json(enabled)
        : undefined,
    ),
  );
}

const SEVERAL_FILES = {
  files: ["sample.pdf", "multi-page-sample.pdf"],
  workbench: "fileEditor",
} as const;

const LINE_ART_INFO = /^Reduces images to high-contrast black and white/;

const WITH_LINE_ART = lineArtEnabled(true);
const WITHOUT_LINE_ART = lineArtEnabled(false);

function compressesTo(fixture: FixtureName) {
  return lineArtEnabled(
    true,
    fixtureResponse("/api/v1/misc/compress-pdf", fixture),
  );
}

function setCompressionLevel(level: number, helpText: RegExp) {
  return async (context: PlayContext) => {
    await typeInto(context, "Quality Adjustment", String(level));
    const panel = await panelOf(context);
    await expect(await panel.findByText(helpText)).toBeVisible();
    await expect(
      panel.getByRole("slider", { name: "Quality Adjustment" }),
    ).toHaveAttribute("aria-valuenow", String(level));
  };
}

async function chooseFileSize(context: PlayContext) {
  await choose(context, "File Size");
  return waitForPanelText(context, "Desired File Size");
}

async function enterFileSize(context: PlayContext) {
  const panel = await chooseFileSize(context);
  const size = panel.getByPlaceholderText("Enter size");
  await userEvent.type(size, "500");
  await waitFor(() => expect(size).toHaveValue("500"));
  return panel;
}

async function openSizeUnits(context: PlayContext) {
  await enterFileSize(context);
  return openSelect(context, "Size unit");
}

async function tickLineArt(context: PlayContext) {
  await toggle(context, "checkbox", /^Convert images to line art/);
  return waitForPanelText(context, "Edge emphasis");
}

function runUntilNotice(notice: string | RegExp) {
  return async (context: PlayContext) => {
    await runTool(context);
    await waitForPanelText(context, notice);
  };
}

const runWithNoReduction = runUntilNotice(
  "Compression at this level made no improvement to this file. Try a higher compression level.",
);

export const Panel: Story = {
  parameters: WITH_LINE_ART,
  play: async (context) => {
    const panel = await waitForPanelText(
      context,
      "Medium compression with moderate quality reduction",
    );
    await expect(panel.getByRole("radio", { name: "Quality" })).toBeChecked();
    for (const option of [
      "Apply Grayscale for Compression",
      "Linearize PDF for fast web viewing",
      /^Convert images to line art/,
    ])
      await expect(
        await findEnabled(context, "checkbox", option),
      ).not.toBeChecked();
    await expect(getInfoButton(panel, LINE_ART_INFO)).toBeVisible();
  },
};

export const LowCompressionLevel: Story = {
  parameters: WITH_LINE_ART,
  play: setCompressionLevel(
    2,
    /^Lower values preserve quality but result in larger files/,
  ),
};

export const HighCompressionLevel: Story = {
  parameters: WITH_LINE_ART,
  play: setCompressionLevel(9, /^Higher values reduce file size significantly/),
};

export const FileSizeMethod: Story = {
  parameters: WITH_LINE_ART,
  play: async (context) => {
    const panel = await chooseFileSize(context);
    await expect(panel.getByRole("textbox", { name: "Size unit" })).toHaveValue(
      "MB",
    );
    await expect(panel.queryByText("Quality Adjustment")).toBeNull();
  },
};

export const FileSizeRequiredTooltip: Story = {
  parameters: WITH_LINE_ART,
  play: openTooltip({ runButton: true }, { after: chooseFileSize }),
};

export const FileSizeEntered: Story = {
  parameters: WITH_LINE_ART,
  play: async (context) => {
    await enterFileSize(context);
    await findEnabled(context, "button", /^Compress/);
  },
};

export const SizeUnitOptions: Story = {
  parameters: WITH_LINE_ART,
  play: async (context) => {
    const units = await openSizeUnits(context);
    await expect(units.getByRole("option", { name: "KB" })).toBeVisible();
  },
};

export const SizeInKilobytes: Story = {
  parameters: WITH_LINE_ART,
  play: async (context) => {
    await enterFileSize(context);
    await selectOption(context, "Size unit", "KB");
  },
};

export const GrayscaleAndLinearize: Story = {
  parameters: WITH_LINE_ART,
  play: async (context) => {
    await toggle(context, "checkbox", "Apply Grayscale for Compression");
    await toggle(context, "checkbox", "Linearize PDF for fast web viewing");
  },
};

export const LineArt: Story = {
  parameters: WITH_LINE_ART,
  play: async (context) => {
    const panel = await tickLineArt(context);
    await expect(
      panel.getByRole("slider", { name: "Detail level" }),
    ).toHaveAttribute("aria-valuenow", "3");
    await expect(panel.getByRole("radio", { name: "Strong" })).toBeChecked();
  },
};

export const LineArtAdjusted: Story = {
  parameters: WITH_LINE_ART,
  play: async (context) => {
    const panel = await tickLineArt(context);
    const detail = panel.getByRole("slider", { name: "Detail level" });
    detail.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await waitFor(() => expect(detail).toHaveAttribute("aria-valuenow", "5"));
    await choose(context, "Gentle");
  },
};

export const LineArtTooltip: Story = {
  parameters: WITH_LINE_ART,
  play: openTooltip({ info: LINE_ART_INFO }),
};

export const LineArtUnavailable: Story = {
  parameters: WITHOUT_LINE_ART,
  play: async (context) => {
    const panel = await panelOf(context);
    const lineArt = await panel.findByRole(
      "checkbox",
      { name: /^Convert images to line art/ },
      STAGE_TIMEOUT,
    );
    await waitFor(() => expect(lineArt).toBeDisabled(), STAGE_TIMEOUT);
    await expect(queryInfoButton(panel, LINE_ART_INFO)).toBeNull();
  },
};

export const LineArtUnavailableTooltip: Story = {
  parameters: WITHOUT_LINE_ART,
  play: openTooltip({
    element: async (context) => {
      const panel = await panelOf(context);
      const checkbox = await panel.findByRole(
        "checkbox",
        { name: /^Convert images to line art/ },
        STAGE_TIMEOUT,
      );
      await waitFor(() => expect(checkbox).toBeDisabled(), STAGE_TIMEOUT);
      // A disabled checkbox takes no pointer events; its tooltip hangs on the
      // element around it.
      const wrapper = checkbox.closest(".mantine-Checkbox-root")?.parentElement;
      if (!wrapper) throw new Error("The line art checkbox has no wrapper");
      return wrapper;
    },
  }),
};

export const SettingsTooltip: Story = {
  parameters: WITH_LINE_ART,
  play: openTooltip({ step: "Settings" }),
};

export const NoFiles: Story = {
  args: { files: [] },
  parameters: WITH_LINE_ART,
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  parameters: WITH_LINE_ART,
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  parameters: compressesTo("compare_sample_a.pdf"),
  play: async (context) => {
    const panel = await runToResults(context);
    await expect(panel.queryByText(/made no improvement/)).toBeNull();
  },
};

export const NoReduction: Story = {
  parameters: compressesTo("sample.pdf"),
  play: runWithNoReduction,
};

export const NoReductionAtStrongest: Story = {
  parameters: compressesTo("sample.pdf"),
  play: async (context) => {
    await enterFileSize(context);
    await runUntilNotice(
      "Compression ran successfully, but this file can't be compressed any further.",
    )(context);
  },
};

export const NoReductionOnSomeFiles: Story = {
  args: SEVERAL_FILES,
  parameters: compressesTo("sample.pdf"),
  play: runUntilNotice(
    "Compression at this level made no improvement to 1 of 2 files. Try a higher compression level.",
  ),
};

export const NoReductionOnSomeFilesAtStrongest: Story = {
  args: SEVERAL_FILES,
  parameters: compressesTo("sample.pdf"),
  play: async (context) => {
    await setCompressionLevel(
      9,
      /^Higher values reduce file size significantly/,
    )(context);
    await runUntilNotice(
      "Compression ran successfully, but 1 of 2 files can't be compressed any further.",
    )(context);
  },
};

export const UndoOperationTooltip: Story = {
  parameters: compressesTo("sample.pdf"),
  play: openTooltip({ info: "Undo" }, { after: runWithNoReduction }),
};
