import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "@shared/components/EmptyState";
import { Button } from "@shared/components/Button";
import { Card } from "@shared/components/Card";

const meta: Meta<typeof EmptyState> = {
  title: "Primitives/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    title: "Nothing here yet",
    description: "When pipelines are deployed they'll appear in this list.",
    size: "default",
  },
  argTypes: {
    size: { control: "inline-radio", options: ["default", "compact"] },
  },
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

/** Flip title / description / eyebrow / size / actions in controls. */
export const Playground: Story = {};

export const WithCTAs: Story = {
  args: {
    eyebrow: "No pipelines yet",
    title: "Start from a template — or compose from scratch.",
    description:
      "The fastest way in is forking a pre-bundled pipeline like PII Sweep or Compliance Pack.",
    actions: (
      <>
        <Button variant="gradient" trailingIcon={<span aria-hidden>→</span>}>
          Browse templates
        </Button>
        <Button variant="outline">Build from scratch</Button>
      </>
    ),
  },
};

export const InCard: Story = {
  render: () => (
    <Card padding="loose" style={{ maxWidth: "40rem" }}>
      <EmptyState
        title="You're all caught up"
        description="No new notifications."
      />
    </Card>
  ),
};
