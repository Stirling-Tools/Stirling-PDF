import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import { FullscreenToolPanel } from "@app/components/tools/FullscreenToolPanel";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import type { ToolPanelGeometry } from "@app/hooks/tools/useToolPanelGeometry";

const SAMPLE_GEOMETRY: ToolPanelGeometry = {
  left: 80,
  top: 0,
  width: 720,
  height: 800,
};

/** Drives the panel into fullscreen mode so the surface it portals actually renders. */
function ExpandDemo() {
  const { setToolPanelMode, setLeftPanelView } = useToolWorkflow();

  useEffect(() => {
    setToolPanelMode("fullscreen");
    setLeftPanelView("toolPicker");
  }, [setToolPanelMode, setLeftPanelView]);

  return <FullscreenToolPanel geometry={SAMPLE_GEOMETRY} />;
}

// Reads/writes toolPanelMode, leftPanelView, readerMode, search, and the tool
// registry via ToolWorkflowContext, plus useWorkbenchBar and PreferencesContext
// — mount the real provider tree rather than stubbing each one individually.
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

const meta = {
  title: "Tools/FullscreenToolPanel",
  component: FullscreenToolPanel,
  parameters: { layout: "fullscreen" },
  decorators: [withProviders],
} satisfies Meta<typeof FullscreenToolPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

// The panel renders null until toolPanelMode is "fullscreen" and the left
// panel view is "toolPicker" — this story forces that state so the fullscreen
// tool picker surface is visible.
export const Expanded: Story = {
  render: () => <ExpandDemo />,
};

// Default context state (sidebar mode) — the component renders null.
export const Collapsed: Story = {
  args: {
    geometry: SAMPLE_GEOMETRY,
  },
};
