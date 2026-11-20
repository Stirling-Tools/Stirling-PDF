import type { StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openMenu,
  openTooltip,
  STAGE_TIMEOUT,
  waitForToolPanel,
  type PanelQueries,
  type PlayContext,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Automate/Panel",
  ...toolPanelMeta("automate"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const SUGGESTED = "Secure PDF Ingestion";
const SAVED = {
  name: "Clean up scans",
  description: "Repairs each file, then strips its annotations.",
  tools: ["Repair", "Remove Annotations"],
};

async function openCreation(context: PlayContext) {
  const panel = within(await waitForToolPanel(context));
  await userEvent.click(
    await panel.findByRole("button", { name: "Create New Automation" }),
  );
  await panel.findByRole("textbox", { name: /Automation Name/ }, STAGE_TIMEOUT);
  return panel;
}

export const Panel: Story = {};

export const SuggestedAutomationTooltip: Story = {
  play: openTooltip({ info: SUGGESTED }),
};

export const CreateAutomation: Story = {
  play: async (context) => {
    await openCreation(context);
  },
};

export const CreateAutomationTooltip: Story = {
  play: openTooltip({ step: "Create Automation" }, { after: openCreation }),
};

export const IconOptionTooltip: Story = {
  play: openTooltip({
    element: async (context) => {
      const panel = await openCreation(context);
      await userEvent.click(panel.getByRole("button", { name: "Icon" }));
      const picker = await within(
        context.canvasElement.ownerDocument.body,
      ).findByRole("dialog", {}, STAGE_TIMEOUT);
      return picker.querySelector<HTMLElement>(".mantine-SimpleGrid-root > *")!;
    },
  }),
};

export const ToolSelected: Story = {
  play: async (context) => {
    const panel = await openCreation(context);
    const [firstTool] = panel.getAllByPlaceholderText("Select a tool...");
    await userEvent.type(firstTool, "Compress");
    await userEvent.click(
      await panel.findByRole("button", { name: /^Compress/ }, STAGE_TIMEOUT),
    );
    await panel.findByRole("button", { name: "Configure tool" }, STAGE_TIMEOUT);
  },
};

export const RunAutomation: Story = {
  play: async (context) => {
    const panel = within(await waitForToolPanel(context));
    await userEvent.click(
      await panel.findByRole("button", { name: SUGGESTED }),
    );
    await panel.findByRole("button", { name: /Run Automation/ }, STAGE_TIMEOUT);
  },
};

async function chooseTool(panel: PanelQueries, toolName: string) {
  const [emptySlot] = panel.getAllByPlaceholderText("Select a tool...");
  await userEvent.type(emptySlot, toolName);
  await userEvent.click(
    await panel.findByRole(
      "button",
      { name: new RegExp(`^${toolName}`) },
      STAGE_TIMEOUT,
    ),
  );
}

async function saveAutomation(context: PlayContext) {
  const panel = await openCreation(context);
  await userEvent.type(
    panel.getByRole("textbox", { name: /Automation Name/ }),
    SAVED.name,
  );
  await userEvent.type(
    panel.getByRole("textbox", { name: "Description" }),
    SAVED.description,
  );
  for (const tool of SAVED.tools) await chooseTool(panel, tool);
  const save = panel.getByRole("button", { name: "Save Automation" });
  await waitFor(() => expect(save).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(save);
  return {
    panel,
    entry: await panel.findByRole(
      "button",
      { name: SAVED.name },
      STAGE_TIMEOUT,
    ),
  };
}

async function saveThenEdit(context: PlayContext) {
  const { panel, entry } = await saveAutomation(context);
  await userEvent.hover(entry);
  const menu = await openMenu(context, `Open menu for ${SAVED.name}`);
  await userEvent.click(within(menu).getByRole("menuitem", { name: "Edit" }));
  await panel.findByText("Edit Automation", { exact: true }, STAGE_TIMEOUT);
  return panel;
}

export const EditAutomation: Story = {
  play: async (context) => {
    const panel = await saveThenEdit(context);
    await expect(
      panel.getByRole("textbox", { name: /Automation Name/ }),
    ).toHaveValue(SAVED.name);
    await expect(
      panel.getByRole("textbox", { name: "Description" }),
    ).toHaveValue(SAVED.description);
    for (const tool of SAVED.tools)
      await expect(
        panel.getByRole("button", { name: new RegExp(`^${tool}`) }),
      ).toBeVisible();
    await expect(panel.queryByText("! Not Configured")).toBeNull();
  },
};

export const EditAutomationTooltip: Story = {
  play: openTooltip({ step: "Edit Automation" }, { after: saveThenEdit }),
};

const REPAIR_ENDPOINT = "/api/v1/misc/repair";

async function runSavedAutomation(context: PlayContext) {
  const { panel, entry } = await saveAutomation(context);
  await userEvent.click(entry);
  const run = await panel.findByRole(
    "button",
    { name: "Run Automation" },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(run).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(run);
  return panel;
}

export const RunInProgress: Story = {
  parameters: toolPanelServer(
    http.post(`*${REPAIR_ENDPOINT}`, async () => {
      await delay("infinite");
      return new HttpResponse(null);
    }),
  ),
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

const repairsToSample = toolPanelServer(
  fixtureResponse(REPAIR_ENDPOINT, "sample.pdf"),
);

async function runToResults(context: PlayContext) {
  const panel = await runSavedAutomation(context);
  await panel.findByText("Review", { exact: true }, STAGE_TIMEOUT);
  await panel.findByRole("button", { name: "Finish" }, STAGE_TIMEOUT);
}

export const AutomationResults: Story = {
  parameters: repairsToSample,
  play: runToResults,
};

export const UndoOperationTooltip: Story = {
  parameters: repairsToSample,
  play: openTooltip({ info: "Undo" }, { after: runToResults }),
};
