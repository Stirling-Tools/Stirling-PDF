import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { Route, Routes } from "react-router-dom";
import { PORTAL_BASENAME } from "@portal/contexts/ViewContext";
import { Users } from "@portal/views/Users";
import "@portal/views/Users.css";

/**
 * The Users page: the org roster grouped by team, pending invitations, and the
 * portal-access controls, with every row action hanging off the roster fetch.
 *
 * The whole body is decided by that one roster read — skeleton rows while it is
 * in flight, a retry panel when it fails, the "no members yet" panel when it
 * comes back empty, and the directory otherwise. Which controls the directory
 * offers is a build capability (self-hosted deletes accounts, SaaS removes them
 * from a team), not something a story can vary.
 *
 * Invitations can also be opened straight from elsewhere via `?invite`, which
 * mounts the invite modal on arrival and then drops the param.
 */
const ROSTER = "*/api/v1/proprietary/ui-data/admin-settings";

const meta: Meta<typeof Users> = {
  // AppShell renders every view inside <main>; standalone, this view's
  // own <header> would be promoted to a second banner landmark.
  decorators: [
    (Story: () => React.ReactElement) => (
      <main>
        <Story />
      </main>
    ),
  ],
  title: "Portal/Views/Users",
  component: Users,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Users>;

/** The seeded org: several teams, mixed roles, and portal-access chips. */
export const Default: Story = {};

/** Roster in flight — the table is a stack of skeleton rows. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(ROSTER, async () => {
          await delay("infinite");
          return HttpResponse.json({ users: [] });
        }),
      ],
    },
  },
};

/** A brand-new org: the empty panel points at the invite flow. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(ROSTER, () =>
          HttpResponse.json({ users: [], totalUsers: 0, mailEnabled: false }),
        ),
      ],
    },
  },
};

/** Backend unreachable (or no admin access): a retry panel replaces the table. */
export const LoadFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(ROSTER, () =>
          HttpResponse.json({ detail: "Forbidden" }, { status: 403 }),
        ),
      ],
    },
  },
};

/** Arriving from an `?invite` link: the roster renders with the modal already open. */
export const InviteDeepLink: Story = {
  decorators: [
    (Story: () => React.ReactElement) => {
      const path = `${PORTAL_BASENAME}/users`;
      return (
        <Routes location={`${path}?invite=1`}>
          <Route path={path} element={<Story />} />
        </Routes>
      );
    },
  ],
};
