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

const SUGGESTED = "Secure PDF Ingestion";
const SAVED = {
  name: "Clean up scans",
  description: "Repairs each file, then strips its annotations.",
  tools: ["Repair", "Remove Annotations"],
};
const REPAIR_ENDPOINT = "/api/v1/misc/repair";
const RUN_BUTTON = /^Run (automation|on \d+ files?)$/;

async function openCreation(context: PlayContext) {
  const panel = await panelOf(context);
  await userEvent.click(
    await panel.findByRole("button", { name: "New" }, STAGE_TIMEOUT),
  );
  await panel.findByRole("textbox", { name: /^Name/ }, STAGE_TIMEOUT);
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

async function searchTools(panel: PanelQueries, query: string) {
  const input = await panel.findByPlaceholderText(
    "Search tools…",
    undefined,
    STAGE_TIMEOUT,
  );
  await userEvent.click(input);
  if (query) await userEvent.type(input, query);
}

/** Picks a tool for the open step picker, adding a step first when none is open. */
async function chooseTool(panel: PanelQueries, toolName: string) {
  if (!panel.queryByPlaceholderText("Search tools…"))
    await userEvent.click(panel.getByRole("button", { name: "Add step" }));
  await searchTools(panel, toolName);
  await userEvent.click(
    await panel.findByRole(
      "button",
      { name: new RegExp(`^${toolName}`) },
      STAGE_TIMEOUT,
    ),
  );
  await waitFor(
    () => expect(panel.queryByPlaceholderText("Search tools…")).toBeNull(),
    STAGE_TIMEOUT,
  );
}

async function closeOpenSettings(panel: PanelQueries) {
  const done = panel.queryByRole("button", { name: "Done" });
  if (done) await userEvent.click(done);
}

async function fillAutomation(context: PlayContext) {
  const panel = await openCreation(context);
  await userEvent.type(
    panel.getByRole("textbox", { name: /^Name/ }),
    SAVED.name,
  );
  await userEvent.type(
    panel.getByRole("textbox", { name: /^Description/ }),
    SAVED.description,
  );
  for (const tool of SAVED.tools) {
    await chooseTool(panel, tool);
    await closeOpenSettings(panel);
  }
  const save = panel.getByRole("button", { name: "Save" });
  await waitFor(() => expect(save).toBeEnabled(), STAGE_TIMEOUT);
  return panel;
}

/** Saves the filled automation, which opens its workspace. */
async function saveAutomation(context: PlayContext) {
  const panel = await fillAutomation(context);
  await userEvent.click(panel.getByRole("button", { name: "Save" }));
  await panel.findByRole("button", { name: RUN_BUTTON }, STAGE_TIMEOUT);
  return panel;
}

async function saveToLibrary(context: PlayContext) {
  const panel = await saveAutomation(context);
  await userEvent.click(
    panel.getByRole("button", { name: "Back to automations" }),
  );
  await panel.findByRole("button", { name: SAVED.name }, STAGE_TIMEOUT);
  return panel;
}

async function saveThenEdit(context: PlayContext) {
  const panel = await saveToLibrary(context);
  const menu = await openEntryMenu(context, SAVED.name);
  await pickMenuItem(menu, "Edit");
  await panel.findByText("Edit automation", { exact: true }, STAGE_TIMEOUT);
  return panel;
}

async function openRun(context: PlayContext, entry: string) {
  const panel = await panelOf(context);
  await userEvent.click(
    await panel.findByRole("button", { name: entry }, STAGE_TIMEOUT),
  );
  await panel.findByRole("button", { name: RUN_BUTTON }, STAGE_TIMEOUT);
  return panel;
}

async function runSavedAutomation(context: PlayContext) {
  const panel = await saveAutomation(context);
  const run = panel.getByRole("button", { name: RUN_BUTTON });
  await waitFor(() => expect(run).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(run);
  return panel;
}

async function runAutomationToResults(context: PlayContext) {
  const panel = await runSavedAutomation(context);
  await panel.findByRole("button", { name: "Run again" }, STAGE_TIMEOUT);
}

export const Panel: Story = {};

export const SuggestedAutomationTooltip: Story = {
  play: openTooltip({ text: SUGGESTED }),
};

export const ImportAutomation: Story = {
  play: async (context) => {
    const panel = await panelOf(context);
    await userEvent.click(
      await panel.findByRole("button", { name: "Import" }, STAGE_TIMEOUT),
    );
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
    const menu = within(await openEntryMenu(context, SUGGESTED));
    for (const item of ["Customize", "Duplicate"])
      await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
  },
};

export const DuplicatedSuggestion: Story = {
  play: async (context) => {
    const menu = await openEntryMenu(context, SUGGESTED);
    await pickMenuItem(menu, "Duplicate");
    const panel = await panelOf(context);
    await panel.findByRole("heading", { name: /^Saved/ }, STAGE_TIMEOUT);
    await panel.findByRole(
      "button",
      { name: `${SUGGESTED} (copy)` },
      STAGE_TIMEOUT,
    );
  },
};

export const CreateAutomation: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await expect(panel.getByText("New automation")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save" })).toBeDisabled();
  },
};

export const IconPicker: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await userEvent.click(panel.getByRole("button", { name: "Choose icon" }));
    await bodyOf(context).findByRole("dialog", {}, STAGE_TIMEOUT);
  },
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

export const StepSettings: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await chooseTool(panel, "Compress");
    await userEvent.click(panel.getByRole("button", { name: "Step settings" }));
    await panel.findByRole("button", { name: "Done" }, STAGE_TIMEOUT);
  },
};

export const StepSettingsFromRow: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await chooseTool(panel, "Compress");
    await closeOpenSettings(panel);
    const settings = panel.getByRole("button", { name: "Step settings" });
    await waitFor(
      () => expect(settings).toHaveAttribute("aria-expanded", "false"),
      STAGE_TIMEOUT,
    );
    await userEvent.click(panel.getByText("Compress", { exact: true }));
    await waitFor(
      () => expect(settings).toHaveAttribute("aria-expanded", "true"),
      STAGE_TIMEOUT,
    );
  },
};

export const StepMenu: Story = {
  // The open menu holds a focusable div that is not a menuitem.
  parameters: knownA11yIssues("aria-required-children"),
  play: async (context) => {
    const panel = await openCreation(context);
    await chooseTool(panel, "Compress");
    await closeOpenSettings(panel);
    const menu = within(await openMenu(context, "More for step 1"));
    for (const item of ["Change tool", "Remove step"])
      await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
  },
};

export const StepNeedsSettings: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await chooseTool(panel, "Add Watermark");
    await panel.findByText("Needs configuration", undefined, STAGE_TIMEOUT);
  },
};

export const ValidDefaultsNeedNoConfiguring: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await userEvent.type(
      panel.getByRole("textbox", { name: /^Name/ }),
      "Shrink",
    );
    await chooseTool(panel, "Compress");
    await panel.findByText("Configured", undefined, STAGE_TIMEOUT);
    await expect(panel.getByRole("button", { name: "Save" })).toBeEnabled();
    await expect(panel.queryByRole("button", { name: "Done" })).toBeNull();
  },
};

export const DiscardChanges: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    await userEvent.type(
      panel.getByRole("textbox", { name: /^Name/ }),
      "Draft",
    );
    await userEvent.click(panel.getByRole("button", { name: "Cancel" }));
    await bodyOf(context).findByRole(
      "dialog",
      { name: "Discard changes?" },
      STAGE_TIMEOUT,
    );
  },
};

export const ReorderKeepsFocus: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    for (const tool of SAVED.tools) {
      await chooseTool(panel, tool);
      await closeOpenSettings(panel);
    }
    const cards = panel.getAllByTestId("automation-step-card");
    // Keyboard focus inside a card reveals its move arrows.
    within(cards[0]).getByRole("button", { name: "More for step 1" }).focus();
    within(cards[0]).getByRole("button", { name: "Move down" }).focus();
    await userEvent.keyboard("{Enter}");
    // The moved step is now last, so its Move down is disabled and focus moves
    // to its Move up, which stays shown for keyboard users.
    await waitFor(() => {
      const focused = context.canvasElement.ownerDocument.activeElement;
      expect(focused?.closest('[data-testid="automation-step-card"]')).toBe(
        panel.getAllByTestId("automation-step-card")[1],
      );
      expect(focused?.getAttribute("aria-label")).toBe("Move up");
    }, STAGE_TIMEOUT);
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
    await saveToLibrary(context);
  },
};

export const SavedAutomationTooltip: Story = {
  play: openTooltip({ text: SAVED.name }, { after: saveToLibrary }),
};

export const SavedAutomationMenu: Story = {
  // The open menu holds a focusable div that is not a menuitem.
  parameters: knownA11yIssues("aria-required-children"),
  play: async (context) => {
    await saveToLibrary(context);
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

export const DeleteConfirmation: Story = {
  play: async (context) => {
    await saveToLibrary(context);
    const menu = await openEntryMenu(context, SAVED.name);
    await pickMenuItem(menu, "Delete");
    const dialog = await bodyOf(context).findByRole(
      "dialog",
      { name: "Delete automation?" },
      STAGE_TIMEOUT,
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    const panel = await panelOf(context);
    await waitFor(
      () =>
        expect(panel.queryByRole("button", { name: SAVED.name })).toBeNull(),
      STAGE_TIMEOUT,
    );
  },
};

export const EditAutomation: Story = {
  play: async (context) => {
    const panel = await saveThenEdit(context);
    await expect(panel.getByRole("textbox", { name: /^Name/ })).toHaveValue(
      SAVED.name,
    );
    await expect(
      panel.getByRole("textbox", { name: /^Description/ }),
    ).toHaveValue(SAVED.description);
    await expect(panel.queryByText("Needs configuration")).toBeNull();
  },
};

export const RenameAutomation: Story = {
  play: async (context) => {
    const panel = await saveThenEdit(context);
    const name = panel.getByRole("textbox", { name: /^Name/ });
    await userEvent.clear(name);
    await userEvent.type(name, "Renamed scans");
    await userEvent.click(panel.getByRole("button", { name: "Save" }));
    await panel.findByRole("button", { name: RUN_BUTTON }, STAGE_TIMEOUT);
    await userEvent.click(
      panel.getByRole("button", { name: "Back to automations" }),
    );
    await panel.findByRole("button", { name: "Renamed scans" }, STAGE_TIMEOUT);
    await expect(panel.queryByRole("button", { name: SAVED.name })).toBeNull();
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
    await expect(panel.getByText("Add a PDF to run this")).toBeVisible();
    await expect(
      panel.getByRole("button", { name: RUN_BUTTON }),
    ).toBeDisabled();
  },
};

export const DescriptionTooltip: Story = {
  play: openTooltip(
    { info: "About this automation" },
    {
      after: saveAutomation,
    },
  ),
};

export const RunInProgress: Story = {
  tags: RUNS_AN_AUTOMATION,
  parameters: toolPanelServer(
    http.post(`*${REPAIR_ENDPOINT}`, async () => {
      await delay("infinite");
      return new HttpResponse(null);
    }),
  ),
  play: async (context) => {
    const panel = await runSavedAutomation(context);
    await panel.findByRole(
      "button",
      { name: /^Running step 1 of 2/ },
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
    await panel.findByRole("button", { name: "Retry" }, STAGE_TIMEOUT);
    await userEvent.click(panel.getByRole("button", { name: "Edit step" }));
    await panel.findByText("Edit automation", { exact: true }, STAGE_TIMEOUT);
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

export const UndoRestoresRun: Story = {
  tags: RUNS_AN_AUTOMATION,
  parameters: repairsToSample,
  play: async (context) => {
    await runAutomationToResults(context);
    const panel = await panelOf(context);
    await userEvent.click(panel.getByRole("button", { name: "Undo" }));
    await panel.findByRole("button", { name: RUN_BUTTON }, STAGE_TIMEOUT);
    await expect(panel.queryByRole("button", { name: "Run again" })).toBeNull();
  },
};

export const EditAndBackKeepsResults: Story = {
  tags: RUNS_AN_AUTOMATION,
  parameters: repairsToSample,
  play: async (context) => {
    await runAutomationToResults(context);
    const panel = await panelOf(context);
    await userEvent.click(panel.getByRole("button", { name: "Edit" }));
    await panel.findByText("Edit automation", { exact: true }, STAGE_TIMEOUT);
    await userEvent.click(
      panel.getByRole("button", { name: `Back to ${SAVED.name}` }),
    );
    await panel.findByRole("button", { name: "Run again" }, STAGE_TIMEOUT);
    await expect(panel.getByRole("button", { name: "Undo" })).toBeVisible();
  },
};

export const UndoOperationTooltip: Story = {
  tags: RUNS_AN_AUTOMATION,
  parameters: repairsToSample,
  play: openTooltip({ info: "Undo" }, { after: runAutomationToResults }),
};
