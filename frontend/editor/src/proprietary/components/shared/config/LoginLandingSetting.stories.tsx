/**
 * The processor-user preference for where to land after signing in.
 *
 * Whether it appears at all is decided before anything is drawn: the build must
 * have the role-based landing switched on and ship the processor routes, and
 * the signed-in account must be one that defaults to the processor. Any of
 * those failing renders nothing, so the hidden case is not a story — the
 * mocked `/auth/me` and `/team/my` pair below is what makes the eligible case
 * reachable. `/team/my` answering 404 is the self-hosted shape, where
 * `portalAccess` alone decides.
 *
 * Once shown there is one control, whose selected segment reflects the stored
 * preference (Processor by default).
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { LoginLandingSetting } from "@app/components/shared/config/LoginLandingSetting";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";

const meta: Meta<typeof LoginLandingSetting> = {
  title: "Config/LoginLandingSetting",
  component: LoginLandingSetting,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        http.get("/api/v1/auth/me", () =>
          HttpResponse.json({
            user: { role: "ROLE_ADMIN", portalAccess: true },
          }),
        ),
        http.get(
          "/api/v1/team/my",
          () => new HttpResponse(null, { status: 404 }),
        ),
      ],
    },
  },
  decorators: [
    (S) => (
      <PreferencesProvider>
        <S />
      </PreferencesProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof LoginLandingSetting>;

export const Default: Story = {};
