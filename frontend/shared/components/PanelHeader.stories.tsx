import type { Meta, StoryObj } from "@storybook/react-vite";
import { PanelHeader } from "@shared/components/PanelHeader";
import { Button } from "@shared/components/Button";
import { StatusBadge } from "@shared/components/StatusBadge";

const meta: Meta<typeof PanelHeader> = {
  title: "Primitives/PanelHeader",
  component: PanelHeader,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    title: "Pipeline detail",
    subtitle: "COI Compliance · us-east-1",
  },
  argTypes: { onBack: { action: "back" } },
};
export default meta;
type Story = StoryObj<typeof PanelHeader>;

/** Toggle title / subtitle / onBack / actions in controls. */
export const Playground: Story = {};

export const WithActions: Story = {
  args: {
    subtitle: "Last deploy 14m ago · golden set 48/48",
    actions: (
      <>
        <StatusBadge tone="success" pulse>
          Healthy
        </StatusBadge>
        <Button size="sm" variant="outline">
          Edit composition
        </Button>
        <Button size="sm" variant="gradient">
          View runs
        </Button>
      </>
    ),
  },
};

export const Everything: Story = {
  args: {
    title: "Pipeline detail — COI Compliance",
    subtitle: "Forked from Compliance Pack · 1,287 docs / 24h",
    onBack: () => {},
    actions: (
      <>
        <StatusBadge tone="success" pulse>
          Healthy
        </StatusBadge>
        <Button size="sm" variant="outline">
          Edit composition
        </Button>
        <Button size="sm" variant="gradient">
          View runs
        </Button>
      </>
    ),
  },
};
