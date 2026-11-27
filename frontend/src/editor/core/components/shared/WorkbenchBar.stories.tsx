import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import WorkbenchBar from "@editor/components/shared/WorkbenchBar";
import {
  ViewerBarButtons,
  ViewerStoryProviders,
} from "@editor/components/viewer/viewerStoryProviders";

/** The bar at a given width, carrying the viewer's own buttons. */
function viewerBar(width: string) {
  return (Story: () => ReactElement) => (
    <ViewerStoryProviders>
      <ViewerBarButtons />
      <div style={{ width }}>
        <Story />
      </div>
    </ViewerStoryProviders>
  );
}

const meta = {
  title: "Shared/WorkbenchBar",
  component: WorkbenchBar,
  parameters: { layout: "fullscreen" },
  args: { currentView: "viewer", setCurrentView: () => {}, hasFiles: true },
} satisfies Meta<typeof WorkbenchBar>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Panel toggles at the far edges; the modes stay centred between them. */
export const Viewer: Story = { decorators: [viewerBar("80rem")] };

/** Too narrow for labels: every icon, edge ones included, spaced evenly. */
export const ViewerNarrow: Story = { decorators: [viewerBar("48rem")] };
