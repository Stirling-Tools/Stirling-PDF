import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  STAGE_TIMEOUT,
  waitForToolPanel,
  type PlayContext,
  unlockEncryptedPdf,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Add Password/Panel",
  ...toolPanelMeta("addPassword"),
};
export default meta;

type Story = StoryObj<typeof meta>;

async function restrictPrinting(context: PlayContext) {
  const panel = within(await waitForToolPanel(context));
  const printing = await panel.findByRole(
    "checkbox",
    { name: "Prevent printing" },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(printing).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(printing);
  await panel.findByLabelText(/New permissions password/);
}

export const Panel: Story = {};

export const ProtectedPdf: Story = {
  args: { files: ["encrypted.pdf"] },
  play: unlockEncryptedPdf,
};

export const ActionsRestricted: Story = {
  play: restrictPrinting,
};

export const PermissionsPasswordMatchesOpening: Story = {
  args: { parameters: { password: "secret", ownerPassword: "secret" } },
  play: async (context) => {
    await restrictPrinting(context);
    await within(context.canvasElement.ownerDocument.body).findByText(
      "The two passwords must be different.",
    );
  },
};

export const PasswordToOpenTooltip: Story = {
  play: openTooltip({ step: "Password to open" }),
};

export const RestrictActionsTooltip: Story = {
  play: openTooltip({ step: "Restrict actions" }),
};

export const EncryptionStrengthTooltip: Story = {
  play: openTooltip({ info: "More information" }),
};

export const PasswordRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};
