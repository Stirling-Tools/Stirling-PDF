import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";

const meta = {
  title: "Components/AppProviders",
  component: AppProviders,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppProviders>;
export default meta;

type Story = StoryObj<typeof meta>;

// Skip the AppConfig network fetch and the blocking-loading gate: supply an
// already-resolved (empty) config so the tree mounts its children immediately.
export const Default: Story = {
  args: {
    appConfigProviderProps: {
      initialConfig: {},
      bootstrapMode: "non-blocking",
      autoFetch: false,
    },
    children: <div>App content</div>,
  },
};
