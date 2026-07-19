import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatBar, StatBarItem } from "@app/ui/StatBar";

const meta: Meta<typeof StatBar> = {
  title: "Layout/StatBar",
  component: StatBar,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof StatBar>;

/** The lead fact carries emphasis; the rest stay muted. */
export const Default: Story = {
  render: () => (
    <StatBar>
      <StatBarItem emphasis>21 pipelines</StatBarItem>
      <StatBarItem>9 used in the last 24 hours</StatBarItem>
      <StatBarItem>12 with no runs</StatBarItem>
    </StatBar>
  ),
};

/** Attention facts take a tone and can click through (e.g. filter the table below). */
export const WithAttentionFact: Story = {
  render: () => (
    <StatBar>
      <StatBarItem emphasis>21 pipelines</StatBarItem>
      <StatBarItem>9 used in the last 24 hours</StatBarItem>
      <StatBarItem tone="warning" onClick={() => {}}>
        1 degraded
      </StatBarItem>
      <StatBarItem title="Reference PDFs with expected outputs; a regression blocks deploy.">
        Checks 390/394
      </StatBarItem>
    </StatBar>
  ),
};
