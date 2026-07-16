import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import { PdfViewerToolbar } from "@app/components/viewer/PdfViewerToolbar";

// Reads page/zoom/spread state off ViewerContext, which only exists inside
// the full app provider tree, so pull that in rather than stubbing it.
// Mirrors AppProviders.stories.tsx's args for skipping the AppConfig network
// fetch and its blocking-loading gate.
const meta = {
  title: "Viewer/PdfViewerToolbar",
  component: PdfViewerToolbar,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <Story />
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof PdfViewerToolbar>;
export default meta;

type Story = StoryObj<typeof meta>;

/** No document loaded yet, so page navigation falls back to its 1/1 defaults. */
export const Default: Story = {
  args: {
    currentPage: 1,
    totalPages: 1,
  },
};
