import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import { NonPdfViewer } from "@app/components/viewer/NonPdfViewer";
import { FileContextProvider } from "@app/contexts/FileContext";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";
import { ViewerProvider } from "@app/contexts/ViewerContext";

/**
 * Inline conversion reads the workspace (to add the PDF) and the viewer (to make it
 * active), so both providers are part of the story surface.
 */
function withProviders(Story: () => ReactElement) {
  return (
    <PreferencesProvider>
      <FileContextProvider enablePersistence={false} enableUrlSync={false}>
        <ToolRegistryProvider>
          <NavigationProvider>
            <ToolWorkflowProvider>
              <ViewerProvider>
                <Story />
              </ViewerProvider>
            </ToolWorkflowProvider>
          </NavigationProvider>
        </ToolRegistryProvider>
      </FileContextProvider>
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

/** CSV preview with the compact conversion bar above it. */
export const Csv: Story = {
  args: {
    file: makeFile(
      "invoice.csv",
      "text/csv",
      "Item,Qty,Price\nWidget,3,9.99\nGadget,1,19.99\n",
    ),
  },
};

/** JSON preview with the compact conversion bar above it. */
export const Json: Story = {
  args: {
    file: makeFile(
      "config.json",
      "application/json",
      JSON.stringify({ name: "Stirling PDF", version: 1 }, null, 2),
    ),
  },
};

/** Image preview keeps the image unobstructed under the compact bar. */
export const Svg: Story = {
  args: {
    file: makeFile(
      "diagram.svg",
      "image/svg+xml",
      // icon-lint-allow: storybook-fixture -- inline svg stands in for an image file opened in the viewer
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#eef2ff"/><circle cx="160" cy="90" r="56" fill="#6366f1"/></svg>',
    ),
  },
};

/** EPUB: no preview, so the hero explains the conversion instead of a dead end. */
export const Epub: Story = {
  args: {
    file: makeFile("novel.epub", "application/epub+zip", "epub"),
  },
};

/** Office documents use the same hero, with engine options in the dialog. */
export const Docx: Story = {
  args: {
    file: makeFile(
      "report.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "docx",
    ),
  },
};
