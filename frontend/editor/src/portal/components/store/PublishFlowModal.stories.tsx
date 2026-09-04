import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import type { Policy } from "@portal/api/pipelines";
import { PublishFlowModal } from "@portal/components/store/PublishFlowModal";

const policy: Policy = {
  id: "plc-redaction",
  name: "Redaction sweep",
  enabled: true,
  inputs: [],
  steps: [
    {
      operation: "/api/v1/security/auto-redact",
      parameters: { mode: "automatic", convertPDFToImage: true },
    },
    { operation: "/api/v1/security/sanitize-pdf", parameters: {} },
  ],
  output: { type: "inline", options: { categoryId: "security" } },
  outputIds: [],
};

const DESCRIPTION =
  "Redacts policy numbers and card numbers from incoming claims, then strips metadata.";

/** Fill the Details step and move to Checks; the mock preflight answers by the pipeline's name. */
async function continueToChecks() {
  const body = within(document.body);
  const description = await body.findByRole("textbox", {
    name: /description/i,
  });
  await userEvent.type(description, DESCRIPTION);
  await userEvent.click(body.getByRole("button", { name: /^continue$/i }));
}

const meta: Meta<typeof PublishFlowModal> = {
  title: "Portal/Store/PublishFlowModal",
  component: PublishFlowModal,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: () => undefined, policy },
  decorators: [
    (Story) => (
      <ToolRegistryProvider>
        <Story />
      </ToolRegistryProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PublishFlowModal>;

/** Step 1: name, category and description beside a live preview of the store card. */
export const Details: Story = {};

/** Step 2 with blockers: the mock preflight blocks any pipeline whose name contains "secret". */
export const Blocked: Story = {
  args: { policy: { ...policy, name: "Redaction sweep (secret keys)" } },
  play: async () => {
    await continueToChecks();
    await expect(
      await within(document.body).findByText(/blocks publishing/i),
    ).toBeInTheDocument();
  },
};

/** Step 2 with only warnings and removals: Continue is enabled. */
export const Ready: Story = {
  play: async () => {
    await continueToChecks();
    await expect(
      await within(document.body).findByText(/removed automatically/i),
    ).toBeInTheDocument();
  },
};
