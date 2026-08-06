import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@app/ui";
import { FlowModal } from "@portal/components/shared/FlowModal";
import { StepModalHeader } from "@portal/components/shared/StepModalHeader";

/** The shell every portal flow dialog sits in. `md` carries the task dialogs,
 *  `lg` the procurement takeover. `label` names the dialog for assistive
 *  technology when the header supplies no visible heading of its own. */
const meta: Meta<typeof FlowModal> = {
  title: "Portal/Shared/FlowModal",
  component: FlowModal,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: () => {} },
};
export default meta;

type Story = StoryObj<typeof FlowModal>;

const Body = () => (
  <p style={{ margin: 0 }}>
    Pick how you want to be billed. You can change this later from the billing
    settings without losing your configured pipelines.
  </p>
);

/** Task-sized dialog with a stepped header and a footer action. */
export const Default: Story = {
  args: {
    label: "Choose a plan",
    size: "md",
    header: (
      <StepModalHeader
        title="Choose a plan"
        step={2}
        total={3}
        stepLabel="Step 2 of 3"
      />
    ),
    footer: <Button>Continue</Button>,
    children: <Body />,
  },
};

/** The wide variant, used by the procurement takeover and Calendly embed. */
export const Large: Story = {
  args: {
    label: "Build your quote",
    size: "lg",
    header: (
      <StepModalHeader
        brand
        title="Build your quote"
        step={1}
        total={4}
        stepLabel="Step 1 of 4"
      />
    ),
    footer: <Button>Continue</Button>,
    children: <Body />,
  },
};

/** No header and no footer — the dialog leans entirely on `label` for its
 *  accessible name. */
export const BareContent: Story = {
  args: { label: "Session expired", size: "md", children: <Body /> },
};

/** Content longer than the viewport must scroll inside the dialog rather than
 *  the page behind it. */
export const LongContent: Story = {
  args: {
    label: "Terms",
    size: "md",
    header: <StepModalHeader title="Terms" />,
    footer: <Button>Accept</Button>,
    children: (
      <div style={{ display: "grid", gap: "1rem" }}>
        {Array.from({ length: 24 }, (_, i) => (
          <p key={i} style={{ margin: 0 }}>
            {i + 1}. Each party shall retain the records described in this
            section for the period required by the applicable retention policy.
          </p>
        ))}
      </div>
    ),
  },
};

/** Closed — nothing renders. */
export const Closed: Story = {
  args: { open: false, label: "Choose a plan", children: <Body /> },
};
