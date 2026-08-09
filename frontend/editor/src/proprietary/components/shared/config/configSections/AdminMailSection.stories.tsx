import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import AdminMailSection from "@app/components/shared/config/configSections/AdminMailSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@app/contexts/UnsavedChangesContext";

/**
 * Admin settings section for the outbound SMTP configuration.
 *
 * Everything on screen comes from the `mail` settings section, fetched on mount,
 * so each story is defined by that one response. The master "Enable Mail" switch
 * gates the email-invites switch beneath it, which is the only conditional
 * rendering in the form — hence a story either side of it.
 *
 * Unlike the neighbouring admin sections this one has no login-required banner:
 * login state only reaches the sticky save footer, which stays hidden until the
 * form is edited, so a login-disabled story would be indistinguishable.
 * useSettingsDirty() and useLoginRequired() still need their providers.
 */
function withProviders(Story: () => React.JSX.Element) {
  return (
    <AppConfigProvider
      autoFetch={false}
      bootstrapMode="non-blocking"
      initialConfig={{ enableLogin: true }}
    >
      <UnsavedChangesProvider>
        <Story />
      </UnsavedChangesProvider>
    </AppConfigProvider>
  );
}

function mailHandler(body: Record<string, unknown>) {
  return http.get("/api/v1/admin/settings/section/mail", () =>
    HttpResponse.json(body),
  );
}

const CONFIGURED_SMTP = {
  enabled: true,
  enableInvites: true,
  host: "smtp.acme-legal.test",
  port: 587,
  username: "postmaster@acme-legal.test",
  password: "correct-horse-battery-staple",
  from: "noreply@acme-legal.test",
};

const meta = {
  title: "Config/AdminMailSection",
  component: AdminMailSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        mailHandler(CONFIGURED_SMTP),
        http.put("/api/v1/admin/settings/section/mail", () =>
          HttpResponse.json({}),
        ),
        http.put("/api/v1/admin/settings", () => HttpResponse.json({})),
      ],
    },
  },
  decorators: [withProviders],
} satisfies Meta<typeof AdminMailSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A working relay: host, credentials and sender all set, invites available. */
export const Default: Story = {};

/** Mail switched off — the invites switch below it is disabled along with it. */
export const MailDisabled: Story = {
  parameters: {
    msw: { handlers: [mailHandler({ enabled: false, enableInvites: false })] },
  },
};

/** Nothing configured yet: every field falls back to its placeholder, port to 587. */
export const Unconfigured: Story = {
  parameters: { msw: { handlers: [mailHandler({})] } },
};

/** While the settings request is in flight, a centred loader replaces the form. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/admin/settings/section/mail", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
      ],
    },
  },
};

/**
 * A relay move saved but awaiting a restart: the pending host, port and sender
 * are shown, each flagged with a pending badge.
 */
export const PendingChanges: Story = {
  parameters: {
    msw: {
      handlers: [
        mailHandler({
          ...CONFIGURED_SMTP,
          _pending: {
            host: "smtp.eu.acme-legal.test",
            port: 465,
            from: "no-reply@acme-legal.test",
          },
        }),
      ],
    },
  },
};
