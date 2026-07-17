import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import { NonPdfViewer } from "@app/components/viewer/NonPdfViewer";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";

/**
 * NonPdfViewer reads tool availability (for the "Convert to PDF" action) via
 * ToolWorkflowContext, which in turn reads the tool registry, preferences,
 * and navigation state — matching the provider nesting AppProviders.tsx sets
 * up above it.
 */
function withProviders(Story: () => ReactElement) {
  return (
    <PreferencesProvider>
      <ToolRegistryProvider>
        <NavigationProvider>
          <ToolWorkflowProvider>
            <Story />
          </ToolWorkflowProvider>
        </NavigationProvider>
      </ToolRegistryProvider>
    </PreferencesProvider>
  );
}

function makeFile(name: string, type: string, contents: string): File {
  return new File([contents], name, { type });
}

const meta = {
  title: "Viewer/NonPdfViewer",
  component: NonPdfViewer,
  parameters: { layout: "fullscreen" },
  decorators: [withProviders],
} satisfies Meta<typeof NonPdfViewer>;
export default meta;

type Story = StoryObj<typeof meta>;

/** CSV preview: parsed into a scrollable table. */
export const Csv: Story = {
  args: {
    sidebarsVisible: true,
    setSidebarsVisible: () => {},
    file: makeFile(
      "invoice.csv",
      "text/csv",
      "Item,Qty,Price\nWidget,3,9.99\nGadget,1,19.99\n",
    ),
  },
};

/** JSON preview: syntax-highlighted / pretty-printed. */
export const Json: Story = {
  args: {
    sidebarsVisible: true,
    setSidebarsVisible: () => {},
    file: makeFile(
      "config.json",
      "application/json",
      JSON.stringify({ name: "Stirling PDF", version: 1 }, null, 2),
    ),
  },
};

/** Unsupported file type: falls back to the "Preview not available" state. */
export const Unsupported: Story = {
  args: {
    sidebarsVisible: true,
    setSidebarsVisible: () => {},
    file: makeFile("archive.zip", "application/zip", "binary-ish-content"),
  },
};
