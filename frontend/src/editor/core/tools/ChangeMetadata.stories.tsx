import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  type PlayContext,
  STAGE_TIMEOUT,
  type TooltipTrigger,
  waitForToolPanel,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Change Metadata/Panel",
  ...toolPanelMeta("changeMetadata"),
};
export default meta;

type Story = StoryObj<typeof meta>;

// Every field stays disabled while the panel reads the PDF's own metadata, and
// that read is not a server query, so waitForToolPanel does not wait for it.
async function waitForMetadataRead(
  context: PlayContext,
  field: { role: string; name: string } = { role: "textbox", name: "Title" },
): Promise<void> {
  const panel = within(await waitForToolPanel(context));
  const control = await panel.findByRole(
    field.role,
    { name: field.name },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(control).toBeEnabled(), STAGE_TIMEOUT);
}

function openTooltipAfterMetadataRead(trigger: TooltipTrigger) {
  return openTooltip(trigger, { after: waitForMetadataRead });
}

export const Panel: Story = {
  play: waitForMetadataRead,
};

export const DeleteAll: Story = {
  args: { parameters: { deleteAll: true } },
  play: (context) =>
    waitForMetadataRead(context, {
      role: "checkbox",
      name: "Delete all metadata",
    }),
};

// The panel replaces every field with the PDF's own metadata each time a read of
// the file lands, and several reads can be in flight, so an entry set through
// args or added early is lost: add again until one survives.
export const CustomField: Story = {
  play: async (context) => {
    const panel = within(await waitForToolPanel(context));
    const add = await panel.findByRole("button", { name: "Add Field" });
    await waitFor(async () => {
      if (
        !panel.queryByPlaceholderText("Custom key") &&
        !add.hasAttribute("disabled")
      ) {
        await userEvent.click(add);
      }
      expect(panel.getByPlaceholderText("Custom key")).toBeVisible();
    }, STAGE_TIMEOUT);
  },
};

export const RemoveExistingMetadataTooltip: Story = {
  play: openTooltipAfterMetadataRead({ step: "Remove Existing Metadata" }),
};

export const StandardFieldsTooltip: Story = {
  play: openTooltipAfterMetadataRead({ step: "Standard Fields" }),
};

export const DateFieldsTooltip: Story = {
  play: openTooltipAfterMetadataRead({ step: "Date Fields" }),
};

export const AdvancedTooltip: Story = {
  play: openTooltipAfterMetadataRead({ step: "Advanced" }),
};

export const CustomMetadataTooltip: Story = {
  play: openTooltipAfterMetadataRead({
    info: "Add custom metadata fields to the document",
  }),
};
