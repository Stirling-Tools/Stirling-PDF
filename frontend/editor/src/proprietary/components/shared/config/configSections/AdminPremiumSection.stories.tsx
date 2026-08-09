import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import AdminPremiumSection from "@app/components/shared/config/configSections/AdminPremiumSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@app/contexts/UnsavedChangesContext";

/**
 * Admin settings section for the premium/enterprise licence key.
 *
 * The component takes no props: it fetches the `premium` settings blob through
 * useAdminSettings on mount and reads login state through useLoginRequired(),
 * so what it renders is decided by two things — the mocked GET response and
 * whether login mode is on. Login mode off suppresses the fetch entirely, shows
 * the login-required banner and locks every control, which is why that state
 * gets its own decorator rather than a different response.
 *
 * useSettingsDirty() and useAppConfig() both throw without their providers, so
 * every story wraps in both.
 */
function withProviders(enableLogin: boolean) {
  return function Decorator(Story: () => React.JSX.Element) {
    return (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{ enableLogin }}
      >
        <UnsavedChangesProvider>
          <Story />
        </UnsavedChangesProvider>
      </AppConfigProvider>
    );
  };
}

function premiumHandler(body: Record<string, unknown>) {
  return http.get("/api/v1/admin/settings/section/premium", () =>
    HttpResponse.json(body),
  );
}

const meta = {
  title: "Config/AdminPremiumSection",
  component: AdminPremiumSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        premiumHandler({
          key: "STORY-LICENCE-0000-0000-0000",
          enabled: true,
        }),
        http.put("/api/v1/admin/settings/section/premium", () =>
          HttpResponse.json({}),
        ),
        http.put("/api/v1/admin/settings", () => HttpResponse.json({})),
      ],
    },
  },
  decorators: [withProviders(true)],
} satisfies Meta<typeof AdminPremiumSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** An activated licence: key populated and premium features switched on. */
export const Default: Story = {};

/** No licence configured yet — the empty key field shows its placeholder. */
export const NoLicence: Story = {
  parameters: {
    msw: { handlers: [premiumHandler({ key: "", enabled: false })] },
  },
};

/** While the settings request is in flight, a centred loader replaces the form. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/admin/settings/section/premium", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
      ],
    },
  },
};

/**
 * Edits saved but awaiting a restart: the merged values are shown with a
 * pending badge beside each field the restart will change.
 */
export const PendingChanges: Story = {
  parameters: {
    msw: {
      handlers: [
        premiumHandler({
          key: "STORY-LICENCE-0000-0000-0000",
          enabled: false,
          _pending: {
            key: "STORY-LICENCE-1111-1111-1111",
            enabled: true,
          },
        }),
      ],
    },
  },
};

/** Login mode disabled: nothing is fetched, the banner shows and the controls lock. */
export const LoginDisabled: Story = {
  decorators: [withProviders(false)],
};
