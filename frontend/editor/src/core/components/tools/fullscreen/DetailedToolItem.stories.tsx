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

// DetailedToolItem reads hotkeys/favourites/availability via useToolMeta, which
// pulls from HotkeyContext, ToolWorkflowContext and AppConfigContext — the same
// nesting AppProviders.tsx sets up above it, so all four are needed here too.
// AppConfigProvider uses autoFetch={false} to skip the network fetch and render
// synchronously instead of showing a loading state.
function withProviders(Story: () => JSX.Element) {
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

const meta = {
  title: "Tools/Fullscreen/DetailedToolItem",
  component: DetailedToolItem,
  decorators: [withProviders],
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
