import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import AdminPrivacySection from "@app/components/shared/config/configSections/AdminPrivacySection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@app/contexts/UnsavedChangesContext";

/**
 * Admin settings section for analytics, metrics and search-engine visibility.
 *
 * The three switches are stitched together from two separate backend sections —
 * `system` carries enableAnalytics/googlevisibility, `metrics` carries enabled —
 * so every story has to mock both GETs; a missing one leaves the section stuck
 * on its loader. Pending (restart-required) changes arrive in a `_pending` block
 * on whichever endpoint owns the field, and the component maps them onto its own
 * camelCase names, so the pending story splits them across both responses.
 *
 * Login mode off skips the fetch entirely, shows the login-required banner and
 * disables the switches, which is why it is a decorator rather than a response.
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

function systemHandler(body: Record<string, unknown>) {
  return http.get("/api/v1/admin/settings/section/system", () =>
    HttpResponse.json(body),
  );
}

function metricsHandler(body: Record<string, unknown>) {
  return http.get("/api/v1/admin/settings/section/metrics", () =>
    HttpResponse.json(body),
  );
}

const meta = {
  title: "Config/AdminPrivacySection",
  component: AdminPrivacySection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        systemHandler({ enableAnalytics: true, googlevisibility: false }),
        metricsHandler({ enabled: true }),
        http.put("/api/v1/admin/settings", () => HttpResponse.json({})),
        http.put("/api/v1/admin/settings/section/privacy", () =>
          HttpResponse.json({}),
        ),
      ],
    },
  },
  decorators: [withProviders(true)],
} satisfies Meta<typeof AdminPrivacySection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Telemetry on, search indexing off — the shipped defaults for a private instance. */
export const Default: Story = {};

/** Everything opted out, the strictest configuration the section can express. */
export const AllCollectionOff: Story = {
  parameters: {
    msw: {
      handlers: [
        systemHandler({ enableAnalytics: false, googlevisibility: false }),
        metricsHandler({ enabled: false }),
      ],
    },
  },
};

/** While either settings request is in flight, a centred loader replaces the form. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/admin/settings/section/system", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
        metricsHandler({ enabled: false }),
      ],
    },
  },
};

/**
 * Restart-required edits on fields owned by both endpoints: the switches show
 * the pending values, each flagged with a pending badge.
 */
export const PendingChanges: Story = {
  parameters: {
    msw: {
      handlers: [
        systemHandler({
          enableAnalytics: false,
          googlevisibility: false,
          _pending: { enableAnalytics: true, googlevisibility: true },
        }),
        metricsHandler({ enabled: false, _pending: { enabled: true } }),
      ],
    },
  },
};

/** Login mode disabled: nothing is fetched, the banner shows and the switches lock. */
export const LoginDisabled: Story = {
  decorators: [withProviders(false)],
};
