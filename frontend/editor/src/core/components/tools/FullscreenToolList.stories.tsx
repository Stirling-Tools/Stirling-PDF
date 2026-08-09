/**
 * The tool list behind the fullscreen picker. It has two shapes: with no search
 * term it shows a Quick Access block above the full catalogue; while searching
 * it shows flat match groups and drops Quick Access entirely.
 *
 * Two details decide whether anything renders at all, so the fixture below is
 * built around them: tools are grouped by `categoryId`, and Quick Access only
 * accepts entries that carry a component or a link. An entry with neither is
 * treated as "coming soon" and never reaches the list.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import FullscreenToolList from "@app/components/tools/FullscreenToolList";
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
    // Entries with neither a component nor a link are filtered out of Quick
    // Access and render disabled elsewhere.
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

function Harness({
  filteredTools = ALL_TOOLS,
  searchQuery = "",
  showDescriptions = false,
  selectedToolKey = null,
  favoriteTools = [] as string[],
}: {
  filteredTools?: typeof ALL_TOOLS;
  searchQuery?: string;
  showDescriptions?: boolean;
  selectedToolKey?: string | null;
  favoriteTools?: string[];
}) {
  const workflow = {
    toolRegistry: REGISTRY,
    favoriteTools,
    isFavorite: (id: string) => favoriteTools.includes(id),
    toggleFavorite: () => {},
    toolAvailability: {},
  } as unknown as ToolWorkflowContextValue;

  return (
    <AppConfigProvider
      initialConfig={{ premiumEnabled: true } as never}
      bootstrapMode="non-blocking"
      autoFetch={false}
    >
      <HotkeyContext.Provider value={{ hotkeys: {} } as HotkeyContextValue}>
        <ToolWorkflowContext.Provider value={workflow}>
          <div style={{ width: 420 }}>
            <FullscreenToolList
              filteredTools={filteredTools}
              searchQuery={searchQuery}
              showDescriptions={showDescriptions}
              selectedToolKey={selectedToolKey}
              matchedTextMap={new Map()}
              onSelect={() => {}}
            />
          </div>
        </ToolWorkflowContext.Provider>
      </HotkeyContext.Provider>
    </AppConfigProvider>
  );
}

const meta: Meta<typeof FullscreenToolList> = {
  title: "Tools/Fullscreen/FullscreenToolList",
  component: FullscreenToolList,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof FullscreenToolList>;

/** No search term: Quick Access above the full catalogue. */
export const Default: Story = { render: () => <Harness /> };

/** Descriptions turn each row into the taller detailed form. */
export const WithDescriptions: Story = {
  render: () => <Harness showDescriptions />,
};

/** Favourites join the recommended tools in the Quick Access block. */
export const WithFavourites: Story = {
  render: () => <Harness favoriteTools={["redact", "sign"]} />,
};

export const SelectedTool: Story = {
  render: () => <Harness selectedToolKey="redact" />,
};

/** Searching drops Quick Access and flattens the results into match groups. */
export const Searching: Story = {
  render: () => (
    <Harness
      searchQuery="re"
      filteredTools={ALL_TOOLS.filter(({ item }) =>
        item[1].name.toLowerCase().includes("re"),
      )}
    />
  ),
};

/** A search that matches nothing still renders its empty state. */
export const NoMatches: Story = {
  render: () => <Harness searchQuery="zzzz" filteredTools={[]} />,
};
