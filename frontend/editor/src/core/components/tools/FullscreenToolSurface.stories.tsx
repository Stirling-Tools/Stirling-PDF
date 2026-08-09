/**
 * The fullscreen tool picker's surface: a search field, a details switch, and
 * the whole catalogue beneath them.
 *
 * The surface is a portal onto the body, absolutely placed from the `geometry`
 * the sidebar measures for it — with no geometry it renders nothing at all,
 * which is how it stays out of the way before the panel has been laid out.
 * Everything else is passed straight through to the list: the search term
 * decides whether Quick Access survives, and the details switch decides whether
 * each row carries its description.
 *
 * The list rows are ToolButtons, which read the registry, favourites, hotkeys
 * and app config, so those contexts are stubbed rather than provided in full.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import FullscreenToolSurface from "@app/components/tools/FullscreenToolSurface";
import {
  ToolCategoryId,
  SubcategoryId,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import {
  ToolWorkflowContext,
  type ToolWorkflowContextValue,
} from "@app/contexts/ToolWorkflowContext";
import {
  HotkeyContext,
  type HotkeyContextValue,
} from "@app/contexts/HotkeyContext";

function tool(
  name: string,
  categoryId: ToolCategoryId,
  subcategoryId: SubcategoryId,
): ToolRegistryEntry {
  return {
    icon: <BuildRoundedIcon />,
    name,
    // Entries with neither a component nor a link count as "coming soon" and
    // are dropped from Quick Access, which would empty out half the surface.
    component: () => null,
    description: `${name} — what this tool does, in one line.`,
    categoryId,
    subcategoryId,
    automationSettings: null,
  } as ToolRegistryEntry;
}

const REGISTRY: Record<string, ToolRegistryEntry> = {
  rotate: tool(
    "Rotate pages",
    ToolCategoryId.RECOMMENDED_TOOLS,
    SubcategoryId.PAGE_FORMATTING,
  ),
  compress: tool(
    "Compress",
    ToolCategoryId.RECOMMENDED_TOOLS,
    SubcategoryId.GENERAL,
  ),
  redact: tool(
    "Redact",
    ToolCategoryId.STANDARD_TOOLS,
    SubcategoryId.DOCUMENT_SECURITY,
  ),
  sign: tool("Sign", ToolCategoryId.STANDARD_TOOLS, SubcategoryId.SIGNING),
  extract: tool(
    "Extract pages",
    ToolCategoryId.STANDARD_TOOLS,
    SubcategoryId.EXTRACTION,
  ),
  removeBlanks: tool(
    "Remove blank pages",
    ToolCategoryId.ADVANCED_TOOLS,
    SubcategoryId.REMOVAL,
  ),
};

const ALL_TOOLS = Object.entries(REGISTRY).map(([id, entry]) => ({
  item: [id as ToolId, entry] as [ToolId, ToolRegistryEntry],
}));

/** Roughly the rail the sidebar hands over: inset from the right-hand edge. */
const GEOMETRY = { left: 32, top: 32, width: 720, height: 560 };

const withStubs = (Story: React.ComponentType) => (
  <AppConfigProvider
    initialConfig={{ premiumEnabled: true } as never}
    bootstrapMode="non-blocking"
    autoFetch={false}
  >
    <HotkeyContext.Provider value={{ hotkeys: {} } as HotkeyContextValue}>
      <ToolWorkflowContext.Provider
        value={
          {
            toolRegistry: REGISTRY,
            favoriteTools: [],
            isFavorite: () => false,
            toggleFavorite: () => {},
            toolAvailability: {},
          } as unknown as ToolWorkflowContextValue
        }
      >
        <Story />
      </ToolWorkflowContext.Provider>
    </HotkeyContext.Provider>
  </AppConfigProvider>
);

const meta: Meta<typeof FullscreenToolSurface> = {
  title: "Tools/Fullscreen/FullscreenToolSurface",
  component: FullscreenToolSurface,
  parameters: { layout: "fullscreen" },
  args: {
    searchQuery: "",
    toolRegistry: REGISTRY,
    filteredTools: ALL_TOOLS,
    selectedToolKey: null,
    showDescriptions: false,
    matchedTextMap: new Map(),
    geometry: GEOMETRY,
    onSearchChange: () => {},
    onSelect: () => {},
    onToggleDescriptions: () => {},
    onExitFullscreenMode: () => {},
  },
  decorators: [withStubs],
};
export default meta;

type Story = StoryObj<typeof FullscreenToolSurface>;

/** The full catalogue, Quick Access first. */
export const Default: Story = {};

/** The details switch on: every row grows to carry its description. */
export const WithDescriptions: Story = { args: { showDescriptions: true } };

/** Searching narrows the surface to matches and drops Quick Access. */
export const Searching: Story = {
  args: {
    searchQuery: "re",
    filteredTools: ALL_TOOLS.filter(({ item }) =>
      item[1].name.toLowerCase().includes("re"),
    ),
  },
};

/** A search with no matches still fills the surface with its empty state. */
export const NoMatches: Story = {
  args: { searchQuery: "zzzz", filteredTools: [] },
};

/** The open tool is marked in the list. */
export const SelectedTool: Story = { args: { selectedToolKey: "redact" } };

/** Before the panel has been measured there is nowhere to place the surface. */
export const NotYetMeasured: Story = { args: { geometry: null } };
