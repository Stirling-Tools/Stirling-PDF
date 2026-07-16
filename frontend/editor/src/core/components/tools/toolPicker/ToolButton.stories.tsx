import type { Meta, StoryObj } from "@storybook/react-vite";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import ToolButton from "@app/components/tools/toolPicker/ToolButton";
import { AppProviders } from "@app/components/AppProviders";
import {
  ToolCategoryId,
  SubcategoryId,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";

// ToolButton reads favourites/hotkeys/premium status/navigation via
// ToolWorkflowContext, HotkeyContext, AppConfigContext and NavigationContext —
// mount the real provider tree rather than stubbing each one individually.
function withProviders(Story: () => JSX.Element) {
  return (
    <AppProviders
      appConfigProviderProps={{
        initialConfig: {},
        bootstrapMode: "non-blocking",
        autoFetch: false,
      }}
    >
      <Story />
    </AppProviders>
  );
}

const MOCK_TOOL: ToolRegistryEntry = {
  icon: <BuildRoundedIcon />,
  name: "Compress PDF",
  component: null,
  // A link (or a real component) is required for the tool to render as
  // available — otherwise it is marked "coming soon" and disabled.
  link: "https://example.com",
  description: "Reduce the file size of your PDF document.",
  categoryId: ToolCategoryId.STANDARD_TOOLS,
  subcategoryId: SubcategoryId.PAGE_FORMATTING,
  automationSettings: null,
};

const meta = {
  title: "Tools/ToolPicker/ToolButton",
  component: ToolButton,
  decorators: [withProviders],
  args: {
    id: "compress" as ToolId,
    tool: MOCK_TOOL,
    isSelected: false,
    onSelect: () => {},
  },
} satisfies Meta<typeof ToolButton>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Default row for an available tool. */
export const Default: Story = {};

/** The currently active tool, highlighted. */
export const Selected: Story = {
  args: {
    isSelected: true,
  },
};

/** Shows the description line and a matched-synonym hint below the name, as
 * rendered by the search results list. */
export const WithDescriptionAndSynonym: Story = {
  args: {
    showDescription: true,
    matchedSynonym: "shrink",
  },
};

/** Tool with no `component`/`link` renders as a disabled "coming soon" row. */
export const ComingSoon: Story = {
  args: {
    id: "notYetBuilt" as ToolId,
    tool: {
      ...MOCK_TOOL,
      name: "Future Tool",
      component: null,
      link: undefined,
    },
  },
};
