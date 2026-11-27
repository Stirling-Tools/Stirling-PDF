import type { StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  openMenu,
  openTooltip,
  panelOf,
  type PanelQueries,
  type PlayContext,
  STAGE_TIMEOUT,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Automate/Panel",
  ...toolPanelMeta("automate"),
};
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Stories that run an automation, which the desktop app allows only when
 * signed in to a server: in local mode the run button asks the user to sign in.
 */
const RUNS_AN_AUTOMATION = ["not-in-desktop"];

const CREATE_NEW = "Create New Automation";
const SUGGESTED = "Secure PDF Ingestion";
const SAVED = {
  name: "Clean up scans",
  description: "Repairs each file, then strips its annotations.",
  tools: ["Repair", "Remove Annotations"],
};
const REPAIR_ENDPOINT = "/api/v1/misc/repair";

async function openCreation(context: PlayContext) {
  const panel = await panelOf(context);
  await userEvent.click(
    await panel.findByRole("button", { name: CREATE_NEW }, STAGE_TIMEOUT),
  );
  await panel.findByRole("textbox", { name: /Automation Name/ }, STAGE_TIMEOUT);
  return panel;
}

async function openEntryMenu(context: PlayContext, entry: string) {
  const panel = await panelOf(context);
  await userEvent.hover(
    await panel.findByRole("button", { name: entry }, STAGE_TIMEOUT),
  );
  const menu = await openMenu(context, `Open menu for ${entry}`);
  await waitFor(
    () => expect(within(menu).getAllByRole("menuitem")[0]).toBeVisible(),
    STAGE_TIMEOUT,
  );
  return menu;
}

async function pickMenuItem(menu: HTMLElement, name: string) {
  await userEvent.click(within(menu).getByRole("menuitem", { name }));
  await waitFor(() => expect(menu).not.toBeInTheDocument(), STAGE_TIMEOUT);
}

async function searchTools(panel: PanelQueries, query: string, slot = 0) {
  const input = panel.getAllByPlaceholderText("Select a tool...")[slot];
  await userEvent.click(input);
  if (query) await userEvent.type(input, query);
}

async function chooseTool(panel: PanelQueries, toolName: string) {
  await searchTools(panel, toolName);
  await userEvent.click(
    await panel.findByRole(
      "button",
      { name: new RegExp(`^${toolName}`) },
      STAGE_TIMEOUT,
    ),
  );
}

async function fillAutomation(context: PlayContext) {
  const panel = await openCreation(context);
  await userEvent.type(
    panel.getByRole("textbox", { name: /Automation Name/ }),
    SAVED.name,
  );
  await userEvent.type(
    panel.getByRole("textbox", { name: /^Description/ }),
    SAVED.description,
  );
  for (const tool of SAVED.tools) await chooseTool(panel, tool);
  const save = panel.getByRole("button", { name: "Save Automation" });
  await waitFor(() => expect(save).toBeEnabled(), STAGE_TIMEOUT);
  return panel;
}

async function saveAutomation(context: PlayContext) {
  const panel = await fillAutomation(context);
  await userEvent.click(panel.getByRole("button", { name: "Save Automation" }));
  await panel.findByRole("button", { name: SAVED.name }, STAGE_TIMEOUT);
  return panel;
}

async function saveThenEdit(context: PlayContext) {
  const panel = await saveAutomation(context);
  const menu = await openEntryMenu(context, SAVED.name);
  await pickMenuItem(menu, "Edit");
  await panel.findByText("Edit Automation", { exact: true }, STAGE_TIMEOUT);
  return panel;
}

async function openRun(context: PlayContext, entry: string) {
  const panel = await panelOf(context);
  await userEvent.click(
    await panel.findByRole("button", { name: entry }, STAGE_TIMEOUT),
  );
  await panel.findByRole("button", { name: "Run Automation" }, STAGE_TIMEOUT);
  return panel;
}

async function runSavedAutomation(context: PlayContext) {
  await saveAutomation(context);
  const panel = await openRun(context, SAVED.name);
  const run = panel.getByRole("button", { name: "Run Automation" });
  await waitFor(() => expect(run).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(run);
  return panel;
}

async function runAutomationToResults(context: PlayContext) {
  const panel = await runSavedAutomation(context);
  await panel.findByRole("button", { name: "Undo" }, STAGE_TIMEOUT);
}

export const Panel: Story = {};

export const SuggestedAutomationTooltip: Story = {
  play: openTooltip({ text: SUGGESTED }),
};

export const CreateNewMenu: Story = {
  // The open menu holds a focusable div that is not a menuitem.
  parameters: knownA11yIssues("aria-required-children"),
  play: async (context) => {
    const menu = await openEntryMenu(context, CREATE_NEW);
    await expect(
      within(menu).getByRole("menuitem", { name: "Import" }),
    ).toBeVisible();
  },
};

export const ImportAutomation: Story = {
  play: async (context) => {
    const menu = await openEntryMenu(context, CREATE_NEW);
    await pickMenuItem(menu, "Import");
    await bodyOf(context).findByRole(
      "dialog",
      { name: "Import automation" },
      STAGE_TIMEOUT,
    );
  },
};

export const SuggestedAutomationMenu: Story = {
  // The open menu holds a focusable div that is not a menuitem.
  parameters: knownA11yIssues("aria-required-children"),
  play: async (context) => {
    const menu = await openEntryMenu(context, SUGGESTED);
    await expect(
      within(menu).getByRole("menuitem", { name: "Copy to Saved" }),
    ).toBeVisible();
  },
};

export const CopiedToSaved: Story = {
  play: async (context) => {
    const menu = await openEntryMenu(context, SUGGESTED);
    await pickMenuItem(menu, "Copy to Saved");
    const panel = await panelOf(context);
    await waitFor(
      () =>
        expect(panel.getAllByRole("button", { name: SUGGESTED })).toHaveLength(
          2,
        ),
      STAGE_TIMEOUT,
    );
  },
};

export const CreateAutomation: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await expect(panel.getByText("Selected Tools (2)")).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Save Automation" }),
    ).toBeDisabled();
    await expect(
      panel.getByRole("button", { name: "Export for Folder Scanning" }),
    ).toBeDisabled();
  },
};

async function openIconPicker(context: PlayContext) {
  const panel = await openCreation(context);
  await userEvent.click(panel.getByRole("button", { name: "Icon" }));
  return bodyOf(context).findByRole("dialog", {}, STAGE_TIMEOUT);
}

export const IconPicker: Story = {
  play: async (context) => {
    await openIconPicker(context);
  },
};

export const IconOptionTooltip: Story = {
  play: openTooltip({
    element: async (context) => {
      const picker = await openIconPicker(context);
      // The icon options are plain divs with no role or name.
      const option = picker.querySelector(".mantine-SimpleGrid-root > *");
      if (!(option instanceof HTMLElement))
        throw new Error("The icon picker shows no options");
      return option;
    },
  }),
};

export const ToolPicker: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await searchTools(panel, "");
    await panel.findByRole("button", { name: /^Repair/ }, STAGE_TIMEOUT);
  },
};

export const ToolSearchNoResults: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await searchTools(panel, "zzzz");
    await panel.findByText("No tools found", undefined, STAGE_TIMEOUT);
  },
};

export const ToolNotConfigured: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await chooseTool(panel, "Compress");
    await panel.findByText("! Not Configured", undefined, STAGE_TIMEOUT);
    await expect(
      panel.getByRole("button", { name: "Configure tool" }),
    ).toBeVisible();
  },
};

export const ConfigureTool: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await chooseTool(panel, "Compress");
    await userEvent.click(
      await panel.findByRole(
        "button",
        { name: "Configure tool" },
        STAGE_TIMEOUT,
      ),
    );
    await bodyOf(context).findByRole(
      "dialog",
      { name: /Configure Compress/ },
      STAGE_TIMEOUT,
    );
  },
};

export const ThirdToolAdded: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await userEvent.click(panel.getByRole("button", { name: "Add Tool" }));
    await panel.findByText("Selected Tools (3)", undefined, STAGE_TIMEOUT);
    await expect(
      panel.getByRole("button", { name: "Remove tool" }),
    ).toBeVisible();
  },
};

export const ReadyToSave: Story = {
  play: async (context) => {
    const panel = await fillAutomation(context);
    await expect(panel.getByRole("button", { name: "Export" })).toBeEnabled();
  },
};

export const SavedAutomation: Story = {
  play: async (context) => {
    await saveAutomation(context);
  },
};

export const SavedAutomationTooltip: Story = {
  play: openTooltip({ text: SAVED.name }, { after: saveAutomation }),
};

export const SavedAutomationMenu: Story = {
  // The open menu holds a focusable div that is not a menuitem.
  parameters: knownA11yIssues("aria-required-children"),
  play: async (context) => {
    await saveAutomation(context);
    const menu = within(await openEntryMenu(context, SAVED.name));
    for (const item of [
      "Edit",
      "Export",
      "Export for Folder Scanning",
      "Delete",
    ])
      await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
  },
};

export const EditAutomation: Story = {
  play: async (context) => {
    const panel = await saveThenEdit(context);
    await expect(
      panel.getByRole("textbox", { name: /Automation Name/ }),
    ).toHaveValue(SAVED.name);
    await expect(
      panel.getByRole("textbox", { name: /^Description/ }),
    ).toHaveValue(SAVED.description);
    await expect(panel.queryByText("! Not Configured")).toBeNull();
  },
};

export const RunAutomation: Story = {
  play: async (context) => {
    await openRun(context, SUGGESTED);
  },
};

export const RunWithoutFiles: Story = {
  args: { files: [] },
  play: async (context) => {
    const panel = await openRun(context, SUGGESTED);
    await expect(
      panel.getByRole("button", { name: "Run Automation" }),
    ).toBeDisabled();
  },
};

export const RunInProgress: Story = {
  tags: RUNS_AN_AUTOMATION,
  // AutomationRun's Progress bar has no accessible name.
  parameters: {
    ...knownA11yIssues("aria-progressbar-name"),
    ...toolPanelServer(
      http.post(`*${REPAIR_ENDPOINT}`, async () => {
        await delay("infinite");
        return new HttpResponse(null);
      }),
    ),
  },
  play: async (context) => {
    const panel = await runSavedAutomation(context);
    await panel.findByText("Progress: 1/2", undefined, STAGE_TIMEOUT);
    await panel.findByRole(
      "button",
      { name: "Running Automation..." },
      STAGE_TIMEOUT,
    );
  },
};

export const StepFailed: Story = {
  tags: RUNS_AN_AUTOMATION,
  parameters: toolPanelServer(
    http.post(`*${REPAIR_ENDPOINT}`, () =>
      HttpResponse.json({ error: "Repair failed" }, { status: 500 }),
    ),
  ),
  play: async (context) => {
    const panel = await runSavedAutomation(context);
    await panel.findByText("✕", undefined, STAGE_TIMEOUT);
  },
};

const repairsToSample = toolPanelServer(
  fixtureResponse(REPAIR_ENDPOINT, "sample.pdf"),
);

export const AutomationResults: Story = {
  tags: RUNS_AN_AUTOMATION,
  parameters: repairsToSample,
  play: runAutomationToResults,
};

export const UndoOperationTooltip: Story = {
  tags: RUNS_AN_AUTOMATION,
  parameters: repairsToSample,
  play: openTooltip({ info: "Undo" }, { after: runAutomationToResults }),
};
