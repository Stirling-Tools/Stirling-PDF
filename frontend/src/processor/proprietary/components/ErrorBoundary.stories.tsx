import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

const meta = {
  title: "Portal/ErrorBoundary",
  component: ErrorBoundary,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ErrorBoundary>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No error: children render straight through. */
export const Default: Story = {
  args: {
    children: <div>Everything is fine.</div>,
  },
};

/** A child throws during render; the boundary contains it with the default
 *  fallback card instead of taking down the rest of the page. */
export const CaughtError: Story = {
  args: {
    children: <Boom />,
  },
};

/** A custom fallback receives the boundary's reset function so it can offer
 *  its own retry affordance. */
export const CustomFallback: Story = {
  args: {
    children: <Boom />,
    fallback: (reset) => (
      <div style={{ padding: "2rem" }}>
        <p>Custom error UI.</p>
        <button onClick={reset}>Try again</button>
      </div>
    ),
  },
};
