/**
 * Search results in the tool picker: matched tools grouped by subcategory,
 * or an empty state when nothing matches.
 *
 * Each row is a ToolButton, which reads the tool registry, favourites, hotkey
 * bindings and app config. Mounting ToolWorkflowProvider would stand up the
 * whole registry and its navigation chain, so the fixture supplies the handful
 * of fields the rows actually read.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import SearchResults from "@app/components/tools/SearchResults";
import {
  ToolCategoryId,
  SubcategoryId,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import {
  ToolWorkflowDataContext,
  ToolWorkflowActionsContext,
  type ToolWorkflowDataValue,
  type ToolWorkflowActionsValue,
} from "@app/contexts/ToolWorkflowContext";
import {
  HotkeyContext,
  type HotkeyContextValue,
} from "@app/contexts/HotkeyContext";

function tool(name: string, subcategoryId: SubcategoryId): ToolRegistryEntry {
  return {
    icon: <BuildRoundedIcon />,
    name,
    // An entry with neither a component nor a link is treated as "coming soon"
    // and renders disabled, which would flatten every story into one look.
    component: () => null,
    description: `${name} — what this tool does, in one line.`,
    categoryId: ToolCategoryId.STANDARD_TOOLS,
    subcategoryId,
    automationSettings: null,
  } as ToolRegistryEntry;
}

const MATCHES = [
  {
    item: ["redact", tool("Redact", SubcategoryId.DOCUMENT_SECURITY)] as [
      ToolId,
      ToolRegistryEntry,
    ],
  },
  {
    item: ["sign", tool("Sign", SubcategoryId.SIGNING)] as [
      ToolId,
      ToolRegistryEntry,
    ],
  },
  {
    item: ["extract", tool("Extract pages", SubcategoryId.EXTRACTION)] as [
      ToolId,
      ToolRegistryEntry,
    ],
  },
];

function Harness({
  filteredTools = MATCHES,
  searchQuery = "e",
  favourites = [] as string[],
}: {
  filteredTools?: typeof MATCHES;
  searchQuery?: string;
  favourites?: string[];
}) {
  const data = {
    isFavorite: (id: string) => favourites.includes(id),
    toolAvailability: {},
    toolRegistry: {},
    favoriteTools: favourites,
  } as unknown as ToolWorkflowDataValue;

  return (
    <AppConfigProvider
      initialConfig={{ premiumEnabled: true } as never}
      bootstrapMode="non-blocking"
      autoFetch={false}
    >
      <HotkeyContext.Provider value={{ hotkeys: {} } as HotkeyContextValue}>
        <ToolWorkflowDataContext.Provider value={data}>
          <ToolWorkflowActionsContext.Provider
            value={
              {
                toggleFavorite: () => {},
                handleToolSelect: () => {},
              } as unknown as ToolWorkflowActionsValue
            }
          >
            <div style={{ width: 380 }}>
              <SearchResults
                filteredTools={filteredTools}
                onSelect={() => {}}
                searchQuery={searchQuery}
              />
            </div>
          </ToolWorkflowActionsContext.Provider>
        </ToolWorkflowDataContext.Provider>
      </HotkeyContext.Provider>
    </AppConfigProvider>
  );
}

const meta: Meta<typeof SearchResults> = {
  title: "Tools/SearchResults",
  component: SearchResults,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof SearchResults>;

/** Matches across several subcategories, each with its own heading. */
export const Default: Story = { render: () => <Harness /> };

/** A single match, which is the common case for a specific query. */
export const SingleMatch: Story = {
  render: () => <Harness filteredTools={[MATCHES[0]]} searchQuery="redact" />,
};

/** Nothing matched: the results give way to the empty state. */
export const NoMatches: Story = {
  render: () => <Harness filteredTools={[]} searchQuery="zzzz" />,
};

/** Favourited tools carry a filled star. */
export const WithFavourites: Story = {
  render: () => <Harness favourites={["sign"]} />,
};
