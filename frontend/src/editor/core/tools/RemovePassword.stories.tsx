import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  unlockEncryptedPdf,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Remove Password/Panel",
  ...toolPanelMeta("removePassword", { files: ["encrypted.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {
  play: unlockEncryptedPdf,
};

export const UnprotectedPdf: Story = {
  args: { files: ["sample.pdf"] },
};

export const PasswordsToRemoveTooltip: Story = {
  play: openTooltip(
    { step: "Passwords to remove" },
    { after: unlockEncryptedPdf },
  ),
};

export const PasswordRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }, { after: unlockEncryptedPdf }),
};

export const MixedBatch: Story = {
  args: { files: ["encrypted.pdf", "sample.pdf"], workbench: "fileEditor" },
  play: async (context) => {
    await unlockEncryptedPdf(context);
    await waitForPanelText(context, "Set on 1 of 2 PDFs");
  },
};
