import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SourceModal } from "@processor/components/sources/SourceModal";

// SourceModal calls useQueryClient() to invalidate source queries after a save;
// the global preview doesn't set up react-query, so provide a client here.
const queryClient = new QueryClient();

const meta: Meta<typeof SourceModal> = {
  title: "Portal/Sources/SourceModal",
  component: SourceModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: () => {},
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SourceModal>;

/** No `sourceId`: the connector catalogue (including greyed-out coming-soon entries). */
export const ChooseType: Story = {};

/** A `folder` source: the configure stage, seeded from the mocked record. */
export const EditFolder: Story = {
  args: { sourceId: "src-claims" },
};

/** A `webhook` source: configure stage plus the delivery-URL row (secret stays masked). */
export const EditWebhook: Story = {
  args: { sourceId: "src-webhook" },
};
