import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { useAuth } from "@app/auth";
import { AuthContext } from "@app/auth/context";
import { LinkProvider, type LinkState } from "@portal/contexts/LinkContext";
import { ConnectAccountRail } from "@portal/components/ConnectAccountRail";

/**
 * Both halves of "can link but has not" come from outside the component, and the global mock answers
 * app-config without the flag — so a story that wants the rail has to ask for it.
 */
const canLink = {
  msw: {
    handlers: [
      http.get("/api/v1/account-link/free-tier", () =>
        HttpResponse.json({
          grantUnits: 500,
          usedUnits: 500,
          remainingUnits: 0,
          periodStart: "2026-09-01T00:00:00",
          periodEnd: "2026-10-01T00:00:00",
        }),
      ),
      http.get("/api/v1/config/app-config", () =>
        HttpResponse.json({ accountLinkAvailable: true }),
      ),
    ],
  },
};

const withLinkState = (state: LinkState) => [
  (Story: () => React.JSX.Element) => (
    <LinkProvider initialState={state}>
      <Story />
    </LinkProvider>
  ),
];

const meta: Meta<typeof ConnectAccountRail> = {
  title: "Portal/AccountLink/ConnectAccountRail",
  component: ConnectAccountRail,
  parameters: { layout: "padded" },
  decorators: [
    function Administrator(Story) {
      const auth = useAuth();
      return (
        <AuthContext.Provider
          value={{ ...auth, isAdmin: true, loading: false }}
        >
          <Story />
        </AuthContext.Provider>
      );
    },
  ],
};
export default meta;
type Story = StoryObj<typeof ConnectAccountRail>;

/** Exhausted local allowance; retains the bespoke rail styling across Processor pages. */
export const Default: Story = {
  parameters: canLink,
  decorators: withLinkState("unlinked"),
};

/** Connected, so the rail removes itself. Renders nothing on purpose. */
export const Hidden: Story = {
  parameters: canLink,
  decorators: withLinkState("linked-free"),
};

export const CreditsRemaining: Story = {
  parameters: {
    msw: {
      handlers: [
        ...canLink.msw.handlers.filter((_handler, index) => index !== 0),
        http.get("/api/v1/account-link/free-tier", () =>
          HttpResponse.json({
            grantUnits: 500,
            usedUnits: 120,
            remainingUnits: 380,
            periodStart: "2026-09-01T00:00:00",
            periodEnd: "2026-10-01T00:00:00",
          }),
        ),
      ],
    },
  },
  decorators: withLinkState("unlinked"),
};
