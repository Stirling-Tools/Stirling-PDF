import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import DetailedToolItem from "@app/components/tools/fullscreen/DetailedToolItem";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import {
  ToolWorkflowProvider,
  useToolWorkflow,
} from "@app/contexts/ToolWorkflowContext";
import { HotkeyProvider } from "@app/contexts/HotkeyContext";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import type { ToolId } from "@app/types/toolId";
import {
  ToolCategoryId,
  SubcategoryId,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";

// DetailedToolItem reads hotkeys/favourites/availability via useToolMeta, which
// pulls from HotkeyContext, ToolWorkflowContext and AppConfigContext, so every
// provider here must be present or those reads fail. AppConfigProvider uses
// autoFetch={false} to skip the network fetch and render synchronously instead
// of showing a loading state.
function withProviders(Story: () => React.JSX.Element) {
  return (
    <PreferencesProvider>
      <AppConfigProvider autoFetch={false}>
        <ToolRegistryProvider>
          <NavigationProvider>
            <ToolWorkflowProvider>
              <HotkeyProvider>
                <Story />
              </HotkeyProvider>
            </ToolWorkflowProvider>
          </NavigationProvider>
        </ToolRegistryProvider>
      </AppConfigProvider>
    </PreferencesProvider>
  );
}

// Pulls a real entry out of the same registry the component reads internally
// (via useToolMeta), so the icon/description/availability match a real render.
function ToolItemDemo({
  toolId,
  isSelected = false,
}: {
  toolId: ToolId;
  isSelected?: boolean;
}) {
  const { toolRegistry } = useToolWorkflow();
  const tool = toolRegistry[toolId];
  if (!tool) return null;

  return (
    <DetailedToolItem
      id={toolId}
      tool={tool}
      isSelected={isSelected}
      onClick={() => {}}
    />
  );
}

// Meta-level args are inherited by every story below. The stories themselves
// use `render` to swap in ToolItemDemo (which pulls a real registry entry),
// so these values never actually reach DetailedToolItem — they only exist to
// satisfy the required-props type on StoryAnnotations.
const mockTool: ToolRegistryEntry = {
  icon: null,
  name: "Split",
  component: null,
  description: "Split a PDF into multiple files",
  categoryId: ToolCategoryId.STANDARD_TOOLS,
  subcategoryId: SubcategoryId.GENERAL,
  automationSettings: null,
};

const meta = {
  title: "Tools/Fullscreen/DetailedToolItem",
  component: DetailedToolItem,
  decorators: [withProviders],
  args: {
    id: "split",
    tool: mockTool,
    isSelected: false,
    onClick: () => {},
  },
} satisfies Meta<typeof DetailedToolItem>;
export default meta;

type Story = StoryObj<typeof meta>;

/** An available tool rendered in its default, unselected state. */
export const Default: Story = {
  render: () => <ToolItemDemo toolId={"split" as ToolId} />,
};

/** The active tool in the panel — highlighted selected state. */
export const Selected: Story = {
  render: () => <ToolItemDemo toolId={"split" as ToolId} isSelected />,
};
