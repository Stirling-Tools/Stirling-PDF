import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  STAGE_TIMEOUT,
  waitForToolPanel,
  unlockEncryptedPdf,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Change Permissions/Panel",
  ...toolPanelMeta("changePermissions"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const protectedPdf = { files: ["encrypted.pdf"] } as const;

export const Panel: Story = {};

export const ProtectedPdf: Story = {
  args: protectedPdf,
  play: unlockEncryptedPdf,
};

export const ProtectedPdfNewPermissionsPassword: Story = {
  args: protectedPdf,
  play: async (context) => {
    await unlockEncryptedPdf(context);
    const panel = within(await waitForToolPanel(context));
    const change = await panel.findByRole(
      "checkbox",
      { name: "Change permissions password" },
      STAGE_TIMEOUT,
    );
    await userEvent.click(change);
    await waitFor(() => expect(change).toBeChecked());
    await panel.findByLabelText(/New permissions password/);
  },
};

export const ChangePermissionsTooltip: Story = {
  play: openTooltip({ step: "Change Permissions" }),
};

export const PermissionsPasswordRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};
