import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import AdminEndpointsSection from "@app/components/shared/config/configSections/AdminEndpointsSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@app/contexts/UnsavedChangesContext";

/**
 * Admin settings section for switching individual API endpoints (and whole
 * endpoint groups) off, plus the instance-wide defaults for how unavailable
 * tools are presented to users.
 *
 * It drives two independent settings sections — `endpoints` for the two
 * multi-selects and `ui` for the two preference switches — through separate
 * useAdminSettings instances, so every story mocks both GETs; either one still
 * loading holds the whole section on its loader. The selectable endpoint and
 * group lists are hardcoded in the component, so the response only decides which
 * of them are already picked.
 *
 * Login mode off suppresses both fetches, shows the login-required banner and
 * locks every control, so it is supplied as a decorator rather than a response.
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

function sectionHandlers(
  endpoints: Record<string, unknown>,
  ui: Record<string, unknown>,
) {
  return [
    http.get("/api/v1/admin/settings/section/endpoints", () =>
      HttpResponse.json(endpoints),
    ),
    http.get("/api/v1/admin/settings/section/ui", () => HttpResponse.json(ui)),
  ];
}

const meta = {
  title: "Config/AdminEndpointsSection",
  component: AdminEndpointsSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        ...sectionHandlers({}, {}),
        http.put("/api/v1/admin/settings/section/endpoints", () =>
          HttpResponse.json({}),
        ),
        http.put("/api/v1/admin/settings/section/ui", () =>
          HttpResponse.json({}),
        ),
        http.put("/api/v1/admin/settings", () => HttpResponse.json({})),
      ],
    },
  },
  decorators: [withProviders(true)],
} satisfies Meta<typeof AdminEndpointsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A stock install: nothing disabled, so both multi-selects show their placeholders. */
export const Default: Story = {};

/**
 * A locked-down instance: several endpoints and two whole groups disabled, and
 * the hidden-when-unavailable defaults turned on.
 */
export const EndpointsDisabled: Story = {
  parameters: {
    msw: {
      handlers: sectionHandlers(
        {
          toRemove: ["add-password", "remove-password", "show-javascript"],
          groupsToRemove: ["DeveloperTools", "Automation"],
        },
        {
          defaultHideUnavailableTools: true,
          defaultHideUnavailableConversions: true,
        },
      ),
    },
  },
};

/** While either settings request is in flight, a centred loader replaces the form. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/admin/settings/section/endpoints", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
        http.get("/api/v1/admin/settings/section/ui", () =>
          HttpResponse.json({}),
        ),
      ],
    },
  },
};

/**
 * Restart-required changes on both sections at once: the pending selections and
 * switch positions are shown, each flagged with a pending badge.
 */
export const PendingChanges: Story = {
  parameters: {
    msw: {
      handlers: sectionHandlers(
        {
          toRemove: ["add-password"],
          groupsToRemove: [],
          _pending: { groupsToRemove: ["DeveloperTools"] },
        },
        {
          defaultHideUnavailableTools: false,
          _pending: { defaultHideUnavailableTools: true },
        },
      ),
    },
  },
};

/** Login mode disabled: nothing is fetched, the banner shows and the controls lock. */
export const LoginDisabled: Story = {
  decorators: [withProviders(false)],
};
