import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { http, HttpResponse } from "msw";
import { AuthProvider } from "@editor/auth/UseSession";
import { ServerSetupWizard } from "@editor/components/serverSetup/ServerSetupWizard";
import { SetupSignInScreen } from "@editor/components/serverSetup/SetupScreen";
import {
  stepsFor,
  type SetupMode,
  type SetupStepId,
} from "@editor/components/serverSetup/serverSetupDraft";
// The app loads the card's colours globally (App.tsx); a story has to load them itself.
import "@editor/auth/ui/auth-theme.css";

/** What a new server answers for its current settings. */
const NEW_SERVER_SETTINGS = {
  system: { frontendUrl: "", backendUrl: "", enableAnalytics: null },
  security: { oauth2: { enabled: false } },
  mail: { enabled: false },
  storage: { enabled: true, sharing: { enabled: false } },
  aiEngine: {
    enabled: false,
    url: "http://localhost:5001",
    models: {
      provider: "anthropic",
      fastModel: "claude-haiku-4-5",
      smartModel: "claude-haiku-4-5",
    },
    rag: { embeddingProvider: "voyageai", embeddingModel: "voyage-4" },
    features: { documentQuestions: true },
  },
  mcp: { enabled: false, auth: { mode: "oauth" } },
};

/** A new server that saves everything and, like Docker, cannot restart itself. */
const newServer = [
  http.get("*/api/v1/admin/settings", () =>
    HttpResponse.json(NEW_SERVER_SETTINGS),
  ),
  http.put("*/api/v1/admin/settings", () => HttpResponse.json({})),
  http.post("*/api/v1/settings/update-enable-analytics", () =>
    HttpResponse.json({}),
  ),
  http.post("*/api/v1/admin/settings/setup-complete", () =>
    HttpResponse.json({ persisted: true }),
  ),
  http.post("*/api/v1/admin/settings/restart", () =>
    HttpResponse.json({}, { status: 503 }),
  ),
];

interface WizardProps {
  /** The admin is still on the default password, so setup starts with the account. */
  owesPassword?: boolean;
}

/** The wizard as ServerSetupGate mounts it; only the server is mocked. */
function Wizard({ owesPassword = false }: WizardProps) {
  return (
    <AuthProvider>
      <ServerSetupWizard
        onDone={() => {}}
        passwordChange={
          owesPassword ? { usingDefaultCredentials: true } : undefined
        }
      />
    </AuthProvider>
  );
}

/** First-run setup, rendered by the real wizard against a mocked new server;
 *  each story clicks through the flow to reach its card. */
const meta = {
  title: "Server Setup/Steps",
  component: Wizard,
  parameters: { layout: "fullscreen", msw: { handlers: newServer } },
} satisfies Meta<typeof Wizard>;
export default meta;
type Story = StoryObj<typeof meta>;

type Canvas = ReturnType<typeof within>;

const button = (canvas: Canvas, name: string) =>
  userEvent.click(canvas.getByRole("button", { name }));

/** Picks `option` on `setting`'s own control, ahead of any setting nested in its fields. */
const choose = (canvas: Canvas, setting: string, option: string) =>
  userEvent.click(
    within(canvas.getByRole("group", { name: setting })).getAllByText(option, {
      exact: true,
    })[0],
  );

/** From the first card, clicks Continue until `step`'s card is up. */
async function reach(canvas: Canvas, mode: SetupMode, step: SetupStepId) {
  await canvas.findByRole("heading", { name: "Your server is up" });
  if (mode === "custom") await userEvent.click(canvas.getByText("Custom"));
  const steps = stepsFor(mode);
  const target = steps.indexOf(step);
  for (let index = 0; index <= target; index++) {
    await button(canvas, "Continue");
    await canvas.findByText(`${index + 1} of ${steps.length}`);
  }
}

export const SigningIn: Story = {
  render: () => <SetupSignInScreen />,
};

export const Account: Story = {
  args: { owesPassword: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const username = await canvas.findByRole("textbox", { name: /^Username/ });
    await waitFor(() => expect(username).toHaveFocus());
  },
};

export const AccountMismatch: Story = {
  args: { owesPassword: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByRole("textbox", { name: /^Username/ }),
      "admin",
    );
    await userEvent.type(canvas.getByLabelText(/^New password/), "adminadmin");
    await userEvent.type(
      canvas.getByLabelText(/^Confirm new password/),
      "adminadmi",
    );
    await button(canvas, "Save and continue");
  },
};

export const Start: Story = {};

export const StartCustom: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Your server is up" });
    await userEvent.click(canvas.getByText("Custom"));
  },
};

export const QuickStart: Story = {
  play: ({ canvasElement }) => reach(within(canvasElement), "quick", "summary"),
};

export const QuickStartEmailOn: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await reach(canvas, "quick", "summary");
    await choose(canvas, "Send email", "On");
  },
};

export const Addresses: Story = {
  play: ({ canvasElement }) =>
    reach(within(canvasElement), "custom", "addresses"),
};

export const Language: Story = {
  play: ({ canvasElement }) =>
    reach(within(canvasElement), "custom", "language"),
};

export const SignIn: Story = {
  play: ({ canvasElement }) => reach(within(canvasElement), "custom", "signIn"),
};

async function chooseOpenIdConnect(canvas: Canvas) {
  await reach(canvas, "custom", "signIn");
  await userEvent.click(canvas.getByRole("textbox", { name: "Sign in with" }));
  await userEvent.click(
    await within(document.body).findByRole("option", {
      name: "Other OpenID Connect",
    }),
  );
}

export const SignInOpenIdConnect: Story = {
  play: ({ canvasElement }) => chooseOpenIdConnect(within(canvasElement)),
};

export const SignInMissingFields: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await chooseOpenIdConnect(canvas);
    await button(canvas, "Continue");
  },
};

export const Email: Story = {
  play: ({ canvasElement }) => reach(within(canvasElement), "custom", "email"),
};

export const EmailOn: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await reach(canvas, "custom", "email");
    await choose(canvas, "Send email", "On");
  },
};

export const Files: Story = {
  play: ({ canvasElement }) => reach(within(canvasElement), "custom", "files"),
};

export const FilesStorageTurnedOff: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await reach(canvas, "custom", "files");
    await choose(canvas, "Store files", "Off");
  },
};

export const AiOn: Story = {
  play: ({ canvasElement }) => reach(within(canvasElement), "custom", "ai"),
};

export const AiConfigured: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await reach(canvas, "custom", "ai");
    await choose(canvas, "Self-hosted AI", "On");
    await within(
      canvas.getByRole("group", { name: "Self-hosted AI" }),
    ).findByRole("radio", { name: "Configured" });
  },
};

export const AiOff: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await reach(canvas, "custom", "ai");
    await choose(canvas, "Self-hosted AI", "Off");
  },
};

export const Analytics: Story = {
  play: ({ canvasElement }) =>
    reach(within(canvasElement), "quick", "analytics"),
};

export const Saved: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await reach(canvas, "quick", "analytics");
    await button(canvas, "Accept and finish");
    await canvas.findByRole("heading", { name: "Settings saved" });
  },
};

export const SaveFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.put("*/api/v1/admin/settings", () =>
          HttpResponse.json({}, { status: 500 }),
        ),
        ...newServer,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await reach(canvas, "quick", "analytics");
    await button(canvas, "Accept and finish");
    await canvas.findByRole("heading", { name: "Couldn't save your settings" });
  },
};
