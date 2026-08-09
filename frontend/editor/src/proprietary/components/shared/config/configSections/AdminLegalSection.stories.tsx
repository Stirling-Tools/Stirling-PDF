import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import AdminLegalSection from "@app/components/shared/config/configSections/AdminLegalSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@app/contexts/UnsavedChangesContext";

/**
 * Admin settings section for the links to legal documents, plus the login
 * agreement users must accept after signing in.
 *
 * The five URL fields and the loginAgreement node all come from the `legal`
 * settings section fetched on mount, so each story is defined by that one
 * response. The embedded LoginAgreementEditor loads its own per-language
 * markdown separately and degrades to empty text when that request is not
 * mocked, which is fine here — this file is about the section around it.
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

function legalHandler(body: Record<string, unknown>) {
  return http.get("/api/v1/admin/settings/section/legal", () =>
    HttpResponse.json(body),
  );
}

const CONFIGURED_LEGAL = {
  termsAndConditions: "https://acme-legal.test/terms",
  privacyPolicy: "https://acme-legal.test/privacy",
  accessibilityStatement: "https://acme-legal.test/accessibility",
  cookiePolicy: "https://acme-legal.test/cookies",
  impressum: "https://acme-legal.test/impressum",
  loginAgreement: {
    enabled: true,
    showInAnonymousMode: true,
  },
};

const meta = {
  title: "Config/AdminLegalSection",
  component: AdminLegalSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        legalHandler(CONFIGURED_LEGAL),
        http.put("/api/v1/admin/settings/section/legal", () =>
          HttpResponse.json({}),
        ),
        http.put("/api/v1/admin/settings", () => HttpResponse.json({})),
      ],
    },
  },
  decorators: [withProviders(true)],
} satisfies Meta<typeof AdminLegalSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** All five documents hosted externally, with the login agreement turned on. */
export const Default: Story = {};

/** A stock install: no documents overridden and no login agreement. */
export const NothingConfigured: Story = {
  parameters: { msw: { handlers: [legalHandler({})] } },
};

/** While the settings request is in flight, a centred loader replaces the form. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/admin/settings/section/legal", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
      ],
    },
  },
};

/** Restart-required document changes: the pending URLs show with pending badges. */
export const PendingChanges: Story = {
  parameters: {
    msw: {
      handlers: [
        legalHandler({
          ...CONFIGURED_LEGAL,
          _pending: {
            privacyPolicy: "https://acme-legal.test/privacy-2",
            impressum: "https://acme-legal.test/legal-notice",
          },
        }),
      ],
    },
  },
};

/** Login mode disabled: nothing is fetched, the banner shows and the form locks. */
export const LoginDisabled: Story = {
  decorators: [withProviders(false)],
};
