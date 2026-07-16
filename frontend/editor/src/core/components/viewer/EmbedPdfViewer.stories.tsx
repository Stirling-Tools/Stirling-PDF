import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import EmbedPdfViewer from "@app/components/viewer/EmbedPdfViewer";

// EmbedPdfViewer reads its active file off FileContext and drives zoom/scroll/
// annotation/redaction/form-fill state through ViewerContext, SignatureContext,
// RedactionContext and FormFillContext — all only available inside the full app
// provider tree, so pull that in rather than stubbing each context individually.
// Mirrors AppProviders.stories.tsx's args for skipping the AppConfig network
// fetch and its blocking-loading gate.
const meta = {
  title: "Viewer/EmbedPdfViewer",
  component: EmbedPdfViewer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <div style={{ height: "600px" }}>
          <Story />
        </div>
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof EmbedPdfViewer>;
export default meta;

type Story = StoryObj<typeof meta>;

/** No file loaded into FileContext yet — renders the "no file provided" state. */
export const Default: Story = {
  args: {
    sidebarsVisible: false,
    setSidebarsVisible: () => {},
  },
};

/**
 * Preview mode with an empty stand-in file: shows the floating close button
 * without engaging the real PDFium/EmbedPDF renderer (a zero-byte file is
 * treated as "no file", so it stays on the lightweight error state).
 */
export const PreviewModeClosable: Story = {
  args: {
    sidebarsVisible: false,
    setSidebarsVisible: () => {},
    previewFile: new File([], "preview.pdf", { type: "application/pdf" }),
    onClose: () => {},
  },
};
