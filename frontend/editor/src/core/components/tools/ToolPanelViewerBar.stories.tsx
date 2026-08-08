/**
 * The row of viewer controls that appears inside the tool panel. It renders
 * only while the viewer is the active workbench, and takes its buttons from the
 * workbench bar rather than declaring them.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import PrintIcon from "@mui/icons-material/Print";
import DownloadIcon from "@mui/icons-material/Download";
import { ToolPanelViewerBar } from "@app/components/tools/ToolPanelViewerBar";
import { withToolContexts } from "@app/components/tools/storyFixtures";
import { WorkbenchBarContext } from "@app/contexts/WorkbenchBarContext";

/** The bar renders only the "tool-panel" section, and names each control from
 *  ariaLabel (falling back to a string tooltip) — not from `label`. */
const BUTTONS = [
  {
    id: "zoom",
    section: "tool-panel",
    ariaLabel: "Zoom in",
    icon: <ZoomInIcon />,
    onClick: () => {},
  },
  {
    id: "print",
    section: "tool-panel",
    ariaLabel: "Print",
    icon: <PrintIcon />,
    onClick: () => {},
  },
  {
    id: "download",
    section: "tool-panel",
    ariaLabel: "Download",
    icon: <DownloadIcon />,
    onClick: () => {},
  },
];

function bar(buttons: typeof BUTTONS, allButtonsDisabled = false) {
  return (Story: () => React.ReactElement) => (
    <WorkbenchBarContext.Provider
      value={{ buttons, actions: {}, allButtonsDisabled } as never}
    >
      <Story />
    </WorkbenchBarContext.Provider>
  );
}

const meta: Meta<typeof ToolPanelViewerBar> = {
  title: "Tools/ToolPanelViewerBar",
  component: ToolPanelViewerBar,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof ToolPanelViewerBar>;

export const Default: Story = {
  decorators: [bar(BUTTONS), withToolContexts({ workbench: "viewer" })],
};

/** Everything disabled, which is how the bar looks while a tool is running. */
export const AllDisabled: Story = {
  decorators: [bar(BUTTONS, true), withToolContexts({ workbench: "viewer" })],
};

/** A single control, the minimum the bar ever shows. */
export const OneButton: Story = {
  decorators: [bar([BUTTONS[0]]), withToolContexts({ workbench: "viewer" })],
};

/** Any other workbench and the bar renders nothing. */
export const NotViewerWorkbench: Story = {
  decorators: [bar(BUTTONS), withToolContexts({ workbench: "fileManager" })],
};
