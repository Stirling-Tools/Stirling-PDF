import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { AccountLinkPanel } from "@portal/components/account-link/AccountLinkPanel";
import { listInstances } from "@portal/mocks/link";
import "@portal/views/AccountLink.css";

// AccountLinkPanel reads the shared account-link instance from context (the
// preview only supplies LinkProvider), so wrap it in AccountLinkProvider here.
const meta: Meta<typeof AccountLinkPanel> = {
  title: "Portal/AccountLink/AccountLinkPanel",
  component: AccountLinkPanel,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <AccountLinkProvider>
        <Story />
      </AccountLinkProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AccountLinkPanel>;

/**
 * The Settings account-link surface: the status badge (driven by the Link
 * toolbar global), the LinkAccountCard for this instance, and — once linked —
 * the team-wide linked-instances table.
 */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/account-link/status", () =>
          HttpResponse.json({ linked: true, name: "prod-eu-gateway" }),
        ),
        http.get("*/api/v1/account-link/instances", () =>
          HttpResponse.json(listInstances()),
        ),
      ],
    },
  },
};

/** Not linked — the instances table is hidden until this instance links its org. */
export const NotLinked: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/account-link/status", () =>
          HttpResponse.json({ linked: false, name: null }),
        ),
      ],
    },
  },
};

/** Linked, but the signed-in admin isn't the team owner — the instances table fails to load. */
export const LoadForbidden: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/account-link/status", () =>
          HttpResponse.json({ linked: true, name: "prod-eu-gateway" }),
        ),
        http.get("*/api/v1/account-link/instances", () =>
          HttpResponse.json({ detail: "Forbidden" }, { status: 403 }),
        ),
      ],
    },
  },
};
