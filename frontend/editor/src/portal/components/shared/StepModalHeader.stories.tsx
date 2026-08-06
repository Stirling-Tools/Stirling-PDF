import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@app/ui";
import { StepModalHeader } from "@portal/components/shared/StepModalHeader";

/** Chrome for any stepped flow modal — the prepay wizard, the metered
 *  checkout and the procurement quote builder all wear this one header rather
 *  than each re-implementing a progress bar. The step label arrives already
 *  translated, so a flow keeps its own copy key. */
const meta: Meta<typeof StepModalHeader> = {
  title: "Portal/Shared/StepModalHeader",
  component: StepModalHeader,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof StepModalHeader>;

/** Mid-flow: title, badge, and a part-filled progress bar. */
export const Default: Story = {
  args: {
    title: "Choose a plan",
    step: 2,
    total: 3,
    stepLabel: "Step 2 of 3",
  },
};

/** A flow that stands alone shows the Stirling wordmark instead of a heading. */
export const Branded: Story = {
  args: {
    brand: true,
    title: "Build your quote",
    step: 1,
    total: 4,
    stepLabel: "Step 1 of 4",
  },
};

/** A step whose heading needs qualifying. */
export const WithSubtitle: Story = {
  args: {
    title: "Review the agreement",
    subtitle: "Enterprise Agreement — v4, covering all seats on this account",
    step: 3,
    total: 4,
    stepLabel: "Step 3 of 4",
  },
};

/** Actions belonging to what's on screen sit before the close control. */
export const WithAside: Story = {
  args: {
    title: "Review the agreement",
    step: 3,
    total: 4,
    stepLabel: "Step 3 of 4",
    aside: (
      <Button variant="tertiary" size="sm">
        Download PDF
      </Button>
    ),
  },
};

/** A terminal receipt: no step badge and no progress bar. */
export const NoProgress: Story = {
  args: { title: "You're all set" },
};

/** Final step — the bar is fully filled. */
export const LastStep: Story = {
  args: { title: "Confirm", step: 4, total: 4, stepLabel: "Step 4 of 4" },
};

/** A flow is not limited to three or four steps; the bar divides evenly. */
export const ManySteps: Story = {
  args: { title: "Map your fields", step: 5, total: 9, stepLabel: "Step 5 of 9" },
};

/** No title: the host modal already renders its own heading. */
export const TitleFromHost: Story = {
  args: { step: 1, total: 2, stepLabel: "Step 1 of 2" },
};
