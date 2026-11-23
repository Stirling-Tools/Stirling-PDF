import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  findEnabled,
  openStep,
  openTooltip,
  panelOf,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
  toggle,
  unlockEncryptedPdf,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Add Password/Panel",
  ...toolPanelMeta("addPassword"),
};
export default meta;

type Story = StoryObj<typeof meta>;

async function enterOpeningPassword(context: PlayContext, password: string) {
  const panel = await panelOf(context);
  const input = await panel.findByLabelText(
    "Password to open",
    { selector: "input" },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(input).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.type(input, password);
  return panel;
}

async function openRestrictions(context: PlayContext) {
  await openStep(context, "Restrict actions");
  await findEnabled(context, "checkbox", "Prevent printing");
  return panelOf(context);
}

async function restrictPrinting(context: PlayContext) {
  await openRestrictions(context);
  const panel = await toggle(context, "checkbox", "Prevent printing");
  return panel.findByLabelText(/^New permissions password/, {
    selector: "input",
  });
}

export const Panel: Story = {};

export const OpeningPasswordEntered: Story = {
  play: async (context) => {
    await enterOpeningPassword(context, "secret");
    await findEnabled(context, "button", /^Add Password/);
  },
};

export const EncryptionStrengthChanged: Story = {
  play: async (context) => {
    const panel = await choose(context, "256-bit");
    await expect(panel.getAllByRole("radio")).toHaveLength(3);
  },
};

export const RestrictActions: Story = {
  play: async (context) => {
    const panel = await openRestrictions(context);
    await expect(panel.getAllByRole("checkbox")).toHaveLength(8);
  },
};

export const ActionsRestricted: Story = {
  play: async (context) => {
    await enterOpeningPassword(context, "secret");
    const ownerPassword = await restrictPrinting(context);
    await userEvent.type(ownerPassword, "different");
    await findEnabled(context, "button", /^Add Password/);
  },
};

export const PermissionsPasswordMatchesOpening: Story = {
  play: async (context) => {
    await enterOpeningPassword(context, "secret");
    const ownerPassword = await restrictPrinting(context);
    await userEvent.type(ownerPassword, "secret");
    await (
      await panelOf(context)
    ).findByText("The two passwords must be different.");
  },
};

export const ProtectedPdf: Story = {
  args: { files: ["encrypted.pdf"] },
  play: async (context) => {
    await unlockEncryptedPdf(context);
    await (
      await panelOf(context)
    ).findByText(
      "These settings replace the PDF's current protection.",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const PasswordToOpenTooltip: Story = {
  play: openTooltip({ step: "Password to open" }),
};

export const EncryptionStrengthTooltip: Story = {
  play: openTooltip({ info: "About Encryption Strength" }),
};

export const RestrictActionsTooltip: Story = {
  play: openTooltip({ step: "Restrict actions" }, { after: openRestrictions }),
};

export const PasswordRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/security/add-password", "sample.pdf"),
  ),
  play: async (context) => {
    await enterOpeningPassword(context, "secret");
    await runToResults(context);
  },
};
