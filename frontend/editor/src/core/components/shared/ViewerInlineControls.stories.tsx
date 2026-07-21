import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import { ViewerInlineControls } from "@app/components/shared/ViewerInlineControls";

// Renders inline in the WorkbenchBar only while the "viewer" workbench is
// active, and reads zoom state off ViewerContext — both only exist inside the
// full app provider tree, so pull that in rather than stubbing each context.
// The AppConfig props skip its network fetch and blocking-loading gate so
// the story renders without a backend.
const meta = {
  title: "Shared/ViewerInlineControls",
  component: ViewerInlineControls,
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
} satisfies Meta<typeof ViewerInlineControls>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Default workbench is "viewer", so the zoom controls render at 100%. */
export const Default: Story = {};
