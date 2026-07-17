import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import CompactToolItem from "@app/components/tools/fullscreen/CompactToolItem";
import { AppProviders } from "@app/components/AppProviders";
import {
  ToolCategoryId,
  SubcategoryId,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";

// CompactToolItem reads favourites/hotkeys/premium status via useToolMeta,
// which pulls from ToolWorkflowContext, HotkeyContext and AppConfigContext —
// mount the real provider tree rather than stubbing each one individually.
function withProviders(Story: () => ReactElement) {
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
  // available — otherwise useToolMeta marks it "coming soon" and disabled.
  link: "https://example.com",
  description: "Reduce the file size of your PDF document.",
  categoryId: ToolCategoryId.STANDARD_TOOLS,
  subcategoryId: SubcategoryId.PAGE_FORMATTING,
  automationSettings: null,
};

const meta = {
  title: "Tools/Fullscreen/CompactToolItem",
  component: CompactToolItem,
  decorators: [withProviders],
  args: {
    id: "compress",
    tool: MOCK_TOOL,
    isSelected: false,
    onClick: () => {},
  },
} satisfies Meta<typeof CompactToolItem>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Default compact row for an available tool. */
export const Default: Story = {};

/** Row rendered as the currently active tool. */
export const Selected: Story = {
  args: {
    isSelected: true,
  },
};

/** Tool with no `component`/`link` renders as a disabled "coming soon" row. */
export const ComingSoon: Story = {
  args: {
    id: "notYetBuilt",
    tool: {
      ...MOCK_TOOL,
      name: "Future Tool",
      component: null,
      link: undefined,
    },
  },
};

/** Alpha-tagged tools show a small "Alpha" badge next to the name. */
export const Alpha: Story = {
  args: {
    tool: {
      ...MOCK_TOOL,
      name: "Experimental Tool",
      component: null,
      link: "https://example.com",
      versionStatus: "alpha",
    },
  },
};
