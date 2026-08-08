import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import AdminFeaturesSection from "@app/components/shared/config/configSections/AdminFeaturesSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@app/contexts/UnsavedChangesContext";

/**
 * Admin settings section for the server certificate used by "Sign with
 * Stirling-PDF".
 *
 * The whole form is read out of the `system` settings section's
 * serverCertificate node, so each story is defined by what that one GET
 * returns. When the node is absent the component substitutes its own defaults
 * rather than showing an empty form — worth seeing, since a fresh install hits
 * that path. Restart-required edits arrive under `system._pending`, which the
 * component re-keys onto serverCertificate before merging.
 *
 * Login mode off suppresses the fetch, shows the login-required banner and locks
 * every control, so it is supplied as a decorator rather than a response.
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

const meta = {
  title: "Config/AdminFeaturesSection",
  component: AdminFeaturesSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        systemHandler({
          serverCertificate: {
            enabled: true,
            organizationName: "Acme Legal Ltd",
            validity: 730,
            regenerateOnStartup: false,
          },
        }),
        http.put("/api/v1/admin/settings", () => HttpResponse.json({})),
        http.put("/api/v1/admin/settings/section/features", () =>
          HttpResponse.json({}),
        ),
      ],
    },
  },
  decorators: [withProviders(true)],
} satisfies Meta<typeof AdminFeaturesSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A configured certificate: named organisation and a two-year validity. */
export const Default: Story = {};

/** Certificate signing turned off, leaving the detail fields editable but inert. */
export const CertificateDisabled: Story = {
  parameters: {
    msw: {
      handlers: [
        systemHandler({
          serverCertificate: {
            enabled: false,
            organizationName: "Acme Legal Ltd",
            validity: 730,
            regenerateOnStartup: false,
          },
        }),
      ],
    },
  },
};

/** No serverCertificate node on the server — the form falls back to its built-in defaults. */
export const UnconfiguredFallsBackToDefaults: Story = {
  parameters: { msw: { handlers: [systemHandler({})] } },
};

/** While the settings request is in flight, a centred loader replaces the form. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/admin/settings/section/system", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
      ],
    },
  },
};

/** Restart-required edits: the pending values are shown, each with a pending badge. */
export const PendingChanges: Story = {
  parameters: {
    msw: {
      handlers: [
        systemHandler({
          serverCertificate: {
            enabled: true,
            organizationName: "Acme Legal Ltd",
            validity: 730,
            regenerateOnStartup: false,
          },
          _pending: {
            serverCertificate: {
              organizationName: "Acme Legal International",
              validity: 365,
              regenerateOnStartup: true,
            },
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
