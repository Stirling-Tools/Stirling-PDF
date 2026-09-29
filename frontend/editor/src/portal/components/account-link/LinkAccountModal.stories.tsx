import type { Meta, StoryObj } from "@storybook/react-vite";
import { useAuth } from "@app/auth";
import { AuthContext } from "@app/auth/context";
import { http, HttpResponse } from "msw";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";

const meta: Meta<typeof LinkAccountModal> = {
  title: "Portal/AccountLink/LinkAccountModal",
  component: LinkAccountModal,
  parameters: { layout: "fullscreen" },
  decorators: [
    function Viewer(Story, context) {
      const auth = useAuth();
      return (
        <AuthContext.Provider
          value={{
            ...auth,
            isAdmin: context.parameters.accountLinkAdmin !== false,
            loading: false,
          }}
        >
          <Story />
        </AuthContext.Provider>
      );
    },
  ],
  args: {
    open: true,
    onClose: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof LinkAccountModal>;

/**
 * "link" mode — explains the trip to Stirling and starts the handshake. There is no
 * sign-in form: a sign-in started on a self-hosted origin cannot complete, because
 * the provider will not redirect back to a hostname it does not know.
 */
export const Default: Story = {};

/** "reauth" mode — the server stays linked; only the browser session is renewed. */
export const Reauth: Story = {
  args: { mode: "reauth" },
};

export const Exhausted: Story = {
  args: { mode: "exhausted" },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/config/app-config", () =>
          HttpResponse.json({ accountLinkAvailable: true }),
        ),
        http.get("/api/v1/account-link/free-tier", () =>
          HttpResponse.json({
            grantUnits: 500,
            usedUnits: 500,
            remainingUnits: 0,
            periodStart: "2026-09-01T00:00:00",
            periodEnd: "2026-10-01T00:00:00",
          }),
        ),
      ],
    },
  },
};

export const TeamMember: Story = {
  args: { mode: "exhausted" },
  parameters: { accountLinkAdmin: false },
};
