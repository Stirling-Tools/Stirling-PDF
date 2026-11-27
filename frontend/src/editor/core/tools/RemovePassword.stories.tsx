import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  panelOf,
  type PlayContext,
  runTool,
  runToResults,
  STAGE_TIMEOUT,
  unlockEncryptedPdf,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Remove Password/Panel",
  ...toolPanelMeta("removePassword", { files: ["encrypted.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

function enterPassword(label: string, password: string) {
  return async (context: PlayContext) => {
    await unlockEncryptedPdf(context);
    const panel = await panelOf(context);
    const input = await panel.findByLabelText(
      label,
      { selector: "input" },
      STAGE_TIMEOUT,
    );
    await waitFor(() => expect(input).toBeEnabled(), STAGE_TIMEOUT);
    await userEvent.type(input, password);
    const run = panel.getByRole("button", { name: /^Remove Password/ });
    await waitFor(() => expect(run).toBeEnabled(), STAGE_TIMEOUT);
    return panel;
  };
}

const enterOpeningPassword = enterPassword("Password to open", "testpass123");

const enterPermissionsPassword = enterPassword(
  "Permissions password",
  "owner-secret",
);

export const Panel: Story = {
  play: unlockEncryptedPdf,
};

export const OpeningPasswordEntered: Story = {
  play: async (context) => {
    await enterOpeningPassword(context);
  },
};

export const PermissionsPasswordEntered: Story = {
  play: async (context) => {
    await enterPermissionsPassword(context);
  },
};

export const PermissionsPasswordOnlyError: Story = {
  play: async (context) => {
    await enterPermissionsPassword(context);
    const panel = await runTool(context);
    await expect(
      await panel.findByRole("alert", undefined, STAGE_TIMEOUT),
    ).toHaveTextContent(/^Reopen this PDF using its opening password/);
  },
};

export const UnprotectedPdf: Story = {
  args: { files: ["sample.pdf"] },
};

export const MixedBatch: Story = {
  args: { files: ["encrypted.pdf", "sample.pdf"], workbench: "fileEditor" },
  play: async (context) => {
    await unlockEncryptedPdf(context);
    await waitForPanelText(context, "Set on 1 of 2 PDFs");
  },
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const PasswordsToRemoveTooltip: Story = {
  play: openTooltip(
    { text: "Passwords to remove" },
    { after: unlockEncryptedPdf },
  ),
};

export const PasswordRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }, { after: unlockEncryptedPdf }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/security/remove-password", "sample.pdf"),
  ),
  play: async (context) => {
    await enterOpeningPassword(context);
    await runToResults(context);
  },
};
