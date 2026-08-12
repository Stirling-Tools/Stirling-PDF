/**
 * The server-URL form itself. Two things decide what it shows: the `loading`
 * flag the wizard passes down while it finishes connecting, and whether a
 * previous session left a server address in web storage, which adds a shortcut
 * back to it.
 *
 * The form's own error and "login not enabled" panels are raised by testing the
 * address against a live server, so they are not reachable from props alone.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ServerSelection } from "@app/components/SetupWizard/ServerSelection";

const LAST_SERVER_KEY = "server_url";

const meta: Meta<typeof ServerSelection> = {
  title: "Desktop/SetupWizard/ServerSelection",
  component: ServerSelection,
  parameters: { layout: "padded" },
  // Start from no remembered server so a story only shows the shortcut when it
  // asks for it.
  beforeEach: async () => {
    localStorage.removeItem(LAST_SERVER_KEY);
  },
  args: {
    onSelect: () => {},
    loading: false,
  },
};
export default meta;

type Story = StoryObj<typeof ServerSelection>;

/** Nothing remembered, so the address has to be typed in full. */
export const Default: Story = {};

/** A previous session's server, offered as a one-click shortcut. */
export const WithLastUsedServer: Story = {
  beforeEach: async () => {
    localStorage.setItem(LAST_SERVER_KEY, "https://pdf.example.internal");
  },
};

/** The wizard is still connecting, which locks the field and the button. */
export const Connecting: Story = { args: { loading: true } };
