import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  panelOf,
  type PanelQueries,
  type PlayContext,
  STAGE_TIMEOUT,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Compare/Panel",
  ...toolPanelMeta("compare", {
    files: ["compare_sample_a.pdf", "compare_sample_b.pdf"],
  }),
};
export default meta;

type Story = StoryObj<typeof meta>;

const ORIGINAL_SLOT = "Select the original PDF";
const EDITED_SLOT = "Select the edited PDF";
const FILE_A = /^compare_sample_a\.pdf/;
const FILE_B = /^compare_sample_b\.pdf/;

/** Opens a slot's file picker on its Workbench tab, which lists the staged fixtures. */
async function openWorkbenchPicker(context: PlayContext, slot: string) {
  const panel = await panelOf(context);
  await userEvent.click(await panel.findByText(slot));
  const body = bodyOf(context);
  const workbenchTab = await body.findByRole(
    "button",
    { name: "Workbench" },
    STAGE_TIMEOUT,
  );
  await userEvent.click(workbenchTab);
  await waitFor(() =>
    expect(workbenchTab).toHaveAttribute("aria-pressed", "true"),
  );
  return body;
}

function findFileRow(body: PanelQueries, name: RegExp) {
  return body.findByRole("button", { name }, STAGE_TIMEOUT);
}

async function pickFile(context: PlayContext, slot: string, name: RegExp) {
  const body = await openWorkbenchPicker(context, slot);
  await userEvent.click(await findFileRow(body, name));
}

export const Panel: Story = {};

export const FilePicker: Story = {
  play: async (context) => {
    const body = await openWorkbenchPicker(context, ORIGINAL_SLOT);
    await findFileRow(body, FILE_A);
  },
};

export const FileThumbnailTooltip: Story = {
  play: async (context) => {
    const body = await openWorkbenchPicker(context, ORIGINAL_SLOT);
    await userEvent.hover(await findFileRow(body, FILE_A));
    await waitFor(
      () =>
        expect(
          context.canvasElement.ownerDocument.querySelector(
            ".file-sidebar-thumb-tooltip img",
          ),
        ).toBeVisible(),
      STAGE_TIMEOUT,
    );
  },
};

export const BothFilesSelected: Story = {
  play: async (context) => {
    await pickFile(context, ORIGINAL_SLOT, FILE_A);
    await pickFile(context, EDITED_SLOT, FILE_B);
    const panel = await panelOf(context);
    await panel.findByRole("button", { name: "Swap" }, STAGE_TIMEOUT);
  },
};
