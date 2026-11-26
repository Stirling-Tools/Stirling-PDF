import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  endpointUnavailable,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  findRunButton,
  panelOf,
  type PanelQueries,
  type PlayContext,
  STAGE_TIMEOUT,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { connectionModeService } from "@editor/services/connectionModeService";
import { authService } from "@editor/services/authService";
import { invoke } from "@tauri-apps/api/core";

/**
 * Convert as the desktop app shows it. Desktop stories start in local mode, on
 * the bundled backend with no account; a story in cloud mode signs in and
 * switches there the way the connection settings do, then undoes both for the
 * next story.
 */
const meta = {
  title: "Tools/Convert/Desktop",
  ...toolPanelMeta("convert"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const SIGNED_IN_CLOUD = "https://cloud.storybook.mock";
const SIGN_IN_TO_USE = "Sign in to use";

/** An unsigned session that expires in 2100: desktop reads only its expiry. */
const CLOUD_SESSION = `${btoa('{"alg":"none"}')}.${btoa('{"sub":"storybook","exp":4102444800}')}.`;

/**
 * Signed in to a cloud account. Desktop drops a cloud connection with no
 * session back to local mode, as it does when a session expires.
 */
const signedInToCloud = {
  beforeEach: async () => {
    await invoke("save_auth_token", { token: CLOUD_SESSION });
    await invoke("save_user_info", {
      username: "storybook",
      email: "storybook@example.com",
    });
    await connectionModeService.switchToSaaS(SIGNED_IN_CLOUD);
    return async () => {
      await connectionModeService.switchToLocal();
      await authService.logout();
    };
  },
};

async function targetFormat(
  context: PlayContext,
  format: string,
): Promise<HTMLElement> {
  const panel = await panelOf(context);
  const trigger = await panel.findByTestId(
    "convert-to-dropdown",
    undefined,
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(trigger).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(trigger);
  const body = await bodyOf(context);
  return body.findByTestId(`format-option-${format}`, undefined, STAGE_TIMEOUT);
}

async function convertTo(
  context: PlayContext,
  format: string,
): Promise<PanelQueries> {
  await userEvent.click(await targetFormat(context, format));
  return panelOf(context);
}

/** An account-only format: locked, with the sign-in hint as its title. */
async function expectNeedsSignIn(option: HTMLElement) {
  await waitFor(
    () => expect(option).toHaveAttribute("title", SIGN_IN_TO_USE),
    STAGE_TIMEOUT,
  );
}

/** A format that runs in the cloud: marked with an icon, with no sign-in hint. */
async function expectRunsInCloud(option: HTMLElement) {
  await waitFor(() => {
    expect(option.querySelector("svg")).not.toBeNull();
    expect(option).not.toHaveAttribute("title");
  }, STAGE_TIMEOUT);
}

export const AccountFormatsInLocalMode: Story = {
  play: async (context) => {
    await expectNeedsSignIn(await targetFormat(context, "docx"));
  },
};

export const SignInToConvert: Story = {
  play: async (context) => {
    const panel = await convertTo(context, "docx");
    await panel.findByRole("button", { name: SIGN_IN_TO_USE }, STAGE_TIMEOUT);
  },
};

export const CloudFormatsInCloudMode: Story = {
  ...signedInToCloud,
  parameters: toolPanelServer(...endpointUnavailable("pdf-to-word")),
  play: async (context) => {
    await expectRunsInCloud(await targetFormat(context, "docx"));
  },
};

export const CloudConversionChosen: Story = {
  ...signedInToCloud,
  parameters: toolPanelServer(...endpointUnavailable("pdf-to-word")),
  play: async (context) => {
    await convertTo(context, "docx");
    const run = await findRunButton(context);
    // The cloud badge is a bare icon badge; its words live in a hover tooltip.
    await waitFor(
      () => expect(run.querySelector(".mantine-Badge-root")).not.toBeNull(),
      STAGE_TIMEOUT,
    );
  },
};
