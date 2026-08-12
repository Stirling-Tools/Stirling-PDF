/**
 * The wizard step that points the desktop app at a self-hosted server: a
 * heading, the banner for whatever the last attempt reported, and the URL form
 * beneath it. The screen owns none of that — the wizard hands it the error text
 * and tells it when a connection is being established.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ServerSelectionScreen } from "@app/components/SetupWizard/ServerSelectionScreen";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";

const meta: Meta<typeof ServerSelectionScreen> = {
  title: "Desktop/SetupWizard/ServerSelectionScreen",
  component: ServerSelectionScreen,
  parameters: { layout: "padded" },
  // The heading's logo resolves a variant through PreferencesContext.
  decorators: [
    (Story) => (
      <PreferencesProvider>
        <Story />
      </PreferencesProvider>
    ),
  ],
  // The form offers a shortcut back to the server last reached, remembered in
  // web storage. Clearing it keeps the stories independent of whatever the
  // browser happens to be carrying.
  beforeEach: async () => {
    localStorage.removeItem("server_url");
  },
  args: {
    onSelect: () => {},
    loading: false,
    error: null,
  },
};
export default meta;

type Story = StoryObj<typeof ServerSelectionScreen>;

/** A first connection, with nothing yet entered. */
export const Default: Story = {};

/** The wizard rejected the last attempt, which adds the banner above the form. */
export const WithError: Story = {
  args: { error: "Could not reach that server. Check the address and retry." },
};

/** The wizard is establishing the connection, so the form is held disabled. */
export const Connecting: Story = { args: { loading: true } };
