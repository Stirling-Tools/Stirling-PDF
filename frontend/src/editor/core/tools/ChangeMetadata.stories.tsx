import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  openSelect,
  openStep,
  openTooltip,
  panelOf,
  type PanelQueries,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Change Metadata/Panel",
  ...toolPanelMeta("changeMetadata"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const STEPS = {
  deleteAll: "Remove Existing Metadata",
  standard: "Standard Fields",
  dates: "Date Fields",
  advanced: "Advanced",
} as const;

/** sample.pdf's own Title, which the panel reads into its fields. */
const SAMPLE_TITLE = "Microsoft Word - sample.docx";

// Every control stays disabled while the panel reads the PDF's own metadata,
// and that read is not a server query, so waitForToolPanel does not wait for it.
async function waitForMetadataRead(context: PlayContext) {
  const panel = await panelOf(context);
  const deleteAll = await panel.findByRole(
    "checkbox",
    { name: "Delete all metadata" },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(deleteAll).toBeEnabled(), STAGE_TIMEOUT);
  return panel;
}

async function openMetadataStep(
  context: PlayContext,
  title: string,
): Promise<PanelQueries> {
  await waitForMetadataRead(context);
  return openStep(context, title);
}

const openStandardFields = (context: PlayContext) =>
  openMetadataStep(context, STEPS.standard);
const openDateFields = (context: PlayContext) =>
  openMetadataStep(context, STEPS.dates);
const openAdvancedOptions = (context: PlayContext) =>
  openMetadataStep(context, STEPS.advanced);

export const Panel: Story = {
  play: async (context) => {
    await waitForMetadataRead(context);
  },
};

export const DeleteAll: Story = {
  play: async (context) => {
    const panel = await waitForMetadataRead(context);
    await userEvent.click(
      panel.getByRole("checkbox", { name: "Delete all metadata" }),
    );
    await waitFor(() =>
      expect(panel.queryByText(STEPS.standard)).not.toBeInTheDocument(),
    );
  },
};

export const StandardFields: Story = {
  play: async (context) => {
    const panel = await openStandardFields(context);
    await waitFor(
      () =>
        expect(panel.getByRole("textbox", { name: "Title" })).toHaveValue(
          SAMPLE_TITLE,
        ),
      STAGE_TIMEOUT,
    );
    for (const name of ["Author", "Subject", "Keywords", "Creator", "Producer"])
      await expect(panel.getByRole("textbox", { name })).toBeVisible();
  },
};

export const DateFields: Story = {
  play: async (context) => {
    const panel = await openDateFields(context);
    await expect(
      await panel.findByText("Creation Date", undefined, STAGE_TIMEOUT),
    ).toBeVisible();
    await expect(panel.getByText("Modification Date")).toBeVisible();
  },
};

export const CreationDatePicker: Story = {
  // DocumentDatesStep passes no labels for the picker's dialog or its
  // previous/next/level controls.
  parameters: knownA11yIssues("aria-dialog-name", "button-name"),
  play: async (context) => {
    const panel = await openDateFields(context);
    await userEvent.click(
      await panel.findByRole(
        "button",
        { name: /Creation Date/ },
        STAGE_TIMEOUT,
      ),
    );
    await bodyOf(context).findByRole("dialog", {}, STAGE_TIMEOUT);
  },
};

export const AdvancedOptions: Story = {
  play: async (context) => {
    const panel = await openAdvancedOptions(context);
    await expect(
      await panel.findByRole(
        "textbox",
        { name: "Trapped Status" },
        STAGE_TIMEOUT,
      ),
    ).toBeVisible();
    await expect(panel.getByText("Custom Metadata")).toBeVisible();
  },
};

export const TrappedStatusOptions: Story = {
  play: async (context) => {
    await openAdvancedOptions(context);
    const listbox = await openSelect(context, "Trapped Status");
    for (const option of ["Unknown", "True", "False"])
      await expect(listbox.getByRole("option", { name: option })).toBeVisible();
  },
};

// The panel replaces every field with the PDF's own metadata each time a read
// of the file lands, and several reads can be in flight, so an entry added or
// typed early is lost: repeat until the entry holds both values.
async function addCustomField(
  context: PlayContext,
  key: string,
  value: string,
): Promise<PanelQueries> {
  const panel = await openAdvancedOptions(context);
  const add = await panel.findByRole(
    "button",
    { name: "Add Field" },
    STAGE_TIMEOUT,
  );
  await waitFor(async () => {
    const keyInput = panel.queryByPlaceholderText("Custom key");
    if (!keyInput) {
      if (!add.hasAttribute("disabled")) await userEvent.click(add);
    } else {
      await retype(keyInput, key);
      await retype(panel.getByPlaceholderText("Custom value"), value);
    }
    expect(panel.getByPlaceholderText("Custom key")).toHaveValue(key);
    expect(panel.getByPlaceholderText("Custom value")).toHaveValue(value);
  }, STAGE_TIMEOUT);
  return panel;
}

async function retype(input: HTMLElement, text: string) {
  if (input instanceof HTMLInputElement && input.value === text) return;
  await userEvent.clear(input);
  await userEvent.type(input, text);
}

export const CustomField: Story = {
  play: async (context) => {
    const panel = await addCustomField(context, "Department", "Legal");
    await expect(panel.getByRole("button", { name: "Remove" })).toBeVisible();
  },
};

export const StandardFieldsTooltip: Story = {
  play: openTooltip({ text: STEPS.standard }, { after: openStandardFields }),
};

export const DateFieldsTooltip: Story = {
  play: openTooltip({ text: STEPS.dates }, { after: openDateFields }),
};

export const AdvancedOptionsTooltip: Story = {
  play: openTooltip({ text: STEPS.advanced }, { after: openAdvancedOptions }),
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/misc/update-metadata", "sample.pdf"),
  ),
  play: async (context) => {
    await waitForMetadataRead(context);
    await runToResults(context);
  },
};
