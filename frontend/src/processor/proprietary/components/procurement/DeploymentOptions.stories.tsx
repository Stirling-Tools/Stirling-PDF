import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { DeploymentOptions } from "@processor/components/procurement/DeploymentOptions";

/** The ways to run Enterprise, a slide each, as shown beside the trial panel on the landing page. */
const meta: Meta<typeof DeploymentOptions> = {
  title: "Portal/Procurement/Deployment options",
  component: DeploymentOptions,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="ent" style={{ height: "auto", maxWidth: "32rem" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DeploymentOptions>;

export const StirlingCloud: Story = {};

export const AirGapped: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Previous" }));
    // The slide fades in, so it is only visible once the transition ends.
    await waitFor(() =>
      expect(
        canvas.getByRole("link", { name: /Offline licence docs/ }),
      ).toBeVisible(),
    );
  },
};
