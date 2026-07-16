import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import ViewerShareButton from "@app/components/viewer/ViewerShareButton";

// Reads the active file off ViewerContext/FileContext and policy enforcement
// status off the policy hooks — all only exist inside the full app provider
// tree, so pull that in rather than stubbing each context. Mirrors
// AppProviders.stories.tsx's args for skipping the AppConfig network fetch and
// its blocking-loading gate.
const meta = {
  title: "Viewer/ViewerShareButton",
  component: ViewerShareButton,
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
} satisfies Meta<typeof ViewerShareButton>;
export default meta;

type Story = StoryObj<typeof meta>;

/** No active file in the viewer, so the button falls back to its disabled state. */
export const Default: Story = {
  args: {},
};

/** Explicitly disabled via the `disabled` prop. */
export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
