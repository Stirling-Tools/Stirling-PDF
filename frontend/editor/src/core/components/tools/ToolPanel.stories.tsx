/**
 * The body of the right rail: the viewer's mini toolbar, then exactly one of
 * three things beneath it.
 *
 * Which one is a chain of checks on workflow state rather than a prop. A search
 * term while the all-tools view is open wins outright and shows the matches;
 * otherwise the panel shows the tool picker, compact until the rail expands into
 * the full catalogue; otherwise it shows the open tool, or an invitation to pick
 * one. The fourth branch — a tool actually rendered — needs the real registry
 * behind ToolRenderer, so it is covered by that component's own stories.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import DrawIcon from "@mui/icons-material/Draw";
import CommentIcon from "@mui/icons-material/Comment";
import ToolPanel from "@app/components/tools/ToolPanel";
import { withToolContexts } from "@app/components/tools/storyFixtures";
import { WorkbenchBarContext } from "@app/contexts/WorkbenchBarContext";
import {
  ToolCategoryId,
  SubcategoryId,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";

function tool(
  name: string,
  categoryId: ToolCategoryId,
  subcategoryId: SubcategoryId,
): ToolRegistryEntry {
  return {
    icon: <BuildRoundedIcon />,
    name,
    // Without a component or a link an entry counts as "coming soon", which
    // renders every row disabled.
    component: () => null,
    description: `${name} — what this tool does, in one line.`,
    categoryId,
    subcategoryId,
    automationSettings: null,
  } as ToolRegistryEntry;
}

const FILTERED_TOOLS = [
  [
    "rotate",
    tool(
      "Rotate pages",
      ToolCategoryId.RECOMMENDED_TOOLS,
      SubcategoryId.PAGE_FORMATTING,
    ),
  ],
  [
    "compress",
    tool("Compress", ToolCategoryId.RECOMMENDED_TOOLS, SubcategoryId.GENERAL),
  ],
  [
    "redact",
    tool(
      "Redact",
      ToolCategoryId.STANDARD_TOOLS,
      SubcategoryId.DOCUMENT_SECURITY,
    ),
  ],
  ["sign", tool("Sign", ToolCategoryId.STANDARD_TOOLS, SubcategoryId.SIGNING)],
  [
    "removeBlanks",
    tool(
      "Remove blank pages",
      ToolCategoryId.ADVANCED_TOOLS,
      SubcategoryId.REMOVAL,
    ),
  ],
].map(([id, entry]) => ({
  item: [id as ToolId, entry as ToolRegistryEntry] as [
    ToolId,
    ToolRegistryEntry,
  ],
}));

/** The viewer bar only shows buttons filed under the tool-panel section. */
const VIEWER_BAR_BUTTONS = [
  {
    id: "annotate",
    section: "tool-panel",
    ariaLabel: "Annotate",
    icon: <DrawIcon />,
  },
  {
    id: "comment",
    section: "tool-panel",
    ariaLabel: "Comment",
    icon: <CommentIcon />,
  },
];

const withWorkbenchBar = (Story: () => React.ReactElement) => (
  <WorkbenchBarContext.Provider
    value={
      {
        buttons: VIEWER_BAR_BUTTONS,
        actions: {},
        allButtonsDisabled: false,
      } as never
    }
  >
    <div
      style={{
        width: 380,
        height: "80vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Story />
    </div>
  </WorkbenchBarContext.Provider>
);

const workflow = (overrides: Record<string, unknown>) =>
  withToolContexts({
    workbench: "viewer",
    workflow: {
      searchQuery: "",
      filteredTools: FILTERED_TOOLS,
      selectedToolKey: null,
      handleToolSelect: () => {},
      setPreviewFile: () => {},
      ...overrides,
    },
  });

const meta: Meta<typeof ToolPanel> = {
  title: "Tools/ToolPanel",
  component: ToolPanel,
  parameters: { layout: "fullscreen" },
  args: { allToolsView: false, onShowAllTools: () => {} },
  decorators: [workflow({ leftPanelView: "toolPicker" }), withWorkbenchBar],
};
export default meta;

type Story = StoryObj<typeof ToolPanel>;

/** Resting state: the compact picker of pinned and recommended tools. */
export const Default: Story = {};

/** Expanded into the full categorised catalogue. */
export const AllTools: Story = { args: { allToolsView: true } };

/** A search term in the all-tools view replaces the picker with its matches. */
export const Searching: Story = {
  args: { allToolsView: true },
  decorators: [
    workflow({
      leftPanelView: "toolPicker",
      searchQuery: "re",
      filteredTools: FILTERED_TOOLS.filter(({ item }) =>
        item[1].name.toLowerCase().includes("re"),
      ),
    }),
  ],
};

/** A search that matches nothing still leaves the empty state in place. */
export const SearchWithNoMatches: Story = {
  args: { allToolsView: true },
  decorators: [
    workflow({
      leftPanelView: "toolPicker",
      searchQuery: "zzzz",
      filteredTools: [],
    }),
  ],
};

/** Past the picker with no tool open — the panel asks for one. */
export const NoToolSelected: Story = {
  decorators: [workflow({ leftPanelView: "toolContent" })],
};
