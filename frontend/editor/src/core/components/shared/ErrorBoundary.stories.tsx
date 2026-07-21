import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "@mantine/core";
import ErrorBoundary from "@app/components/shared/ErrorBoundary";

const meta: Meta<typeof ErrorBoundary> = {
  title: "Shared/ErrorBoundary",
  component: ErrorBoundary,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

function ThrowingChild(): never {
  throw new Error("Simulated render error for Storybook");
}

/** Normal path — children render untouched when nothing throws. */
export const Default: Story = {
  args: {
    children: <Text>Protected content renders normally.</Text>,
  },
};

/** A child throwing during render is caught, showing the default fallback with a retry button. */
export const CaughtError: Story = {
  args: {
    children: <ThrowingChild />,
  },
};

/** A custom fallback component receives the error and a retry callback. */
export const CustomFallback: Story = {
  args: {
    children: <ThrowingChild />,
    fallback: ({ error, retry }) => (
      <Text c="red">
        Custom fallback: {error?.message}
        <button onClick={retry} style={{ marginLeft: 8 }}>
          Retry
        </button>
      </Text>
    ),
  },
};
