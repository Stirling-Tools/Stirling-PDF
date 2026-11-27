import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  findEnabled,
  openTooltip,
  panelOf,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
  toggle,
  unlockEncryptedPdf,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Change Permissions/Panel",
  ...toolPanelMeta("changePermissions"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const protectedPdf = { files: ["encrypted.pdf"] } as const;

async function setPermissions(context: PlayContext) {
  const panel = await panelOf(context);
  const password = await panel.findByLabelText(
    /^New permissions password/,
    { selector: "input" },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(password).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.type(password, "owner-secret");
  for (const name of ["Prevent printing", "Prevent modification"])
    await toggle(context, "checkbox", name);
}

async function replacePermissionsPassword(context: PlayContext) {
  await unlockEncryptedPdf(context);
  const panel = await toggle(
    context,
    "checkbox",
    "Change permissions password",
  );
  await panel.findByLabelText(/^New permissions password/, {
    selector: "input",
  });
}

export const Panel: Story = {};

export const PermissionsSet: Story = {
  play: async (context) => {
    await setPermissions(context);
    await findEnabled(context, "button", /^Change Permissions/);
  },
};

export const ProtectedPdf: Story = {
  args: protectedPdf,
  play: async (context) => {
    await unlockEncryptedPdf(context);
    const panel = await panelOf(context);
    await panel.findByText(
      "Verified for this session",
      undefined,
      STAGE_TIMEOUT,
    );
    await expect(
      panel.getByRole("checkbox", { name: "Change permissions password" }),
    ).not.toBeChecked();
  },
};

export const ProtectedPdfNewPermissionsPassword: Story = {
  args: protectedPdf,
  play: replacePermissionsPassword,
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const ChangePermissionsTooltip: Story = {
  play: openTooltip({ step: "Change Permissions" }),
};

export const PermissionsPasswordRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/security/add-password", "sample.pdf"),
  ),
  play: async (context) => {
    await setPermissions(context);
    await runToResults(context);
  },
};
