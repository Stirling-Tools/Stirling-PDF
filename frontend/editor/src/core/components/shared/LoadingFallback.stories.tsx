import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";

/** Full-screen splash shown while i18next Suspense is loading translations. */
const meta: Meta<typeof LoadingFallback> = {
  title: "Shared/LoadingFallback",
  component: LoadingFallback,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
