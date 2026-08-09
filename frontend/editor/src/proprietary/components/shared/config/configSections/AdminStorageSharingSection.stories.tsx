import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import AdminStorageSharingSection from "@app/components/shared/config/configSections/AdminStorageSharingSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@app/contexts/UnsavedChangesContext";

/**
 * Admin settings section for server-side file storage and the sharing options
 * built on top of it.
 *
 * The five switches form a dependency chain: storage gates sharing and group
 * signing, sharing gates share links and email sharing, and those last two carry
 * their own external prerequisites — a configured frontend URL for links, a
 * configured mail relay for email. Each unmet prerequisite both disables its
 * switch and adds an amber "requires…" note, so the interesting states are
 * points along that chain rather than variations of one payload.
 *
 * The settings are stitched from three sections — `storage` for the switches,
 * `system` for the frontend URL and `mail` for the relay — so every story mocks
 * all three; a missing one leaves the section stuck on its loader.
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

function sectionHandlers({
  storage,
  frontendUrl = "",
  mailEnabled = false,
}: {
  storage: Record<string, unknown>;
  frontendUrl?: string;
  mailEnabled?: boolean;
}) {
  return [
    http.get("/api/v1/admin/settings/section/storage", () =>
      HttpResponse.json(storage),
    ),
    http.get("/api/v1/admin/settings/section/system", () =>
      HttpResponse.json({ frontendUrl }),
    ),
    http.get("/api/v1/admin/settings/section/mail", () =>
      HttpResponse.json({ enabled: mailEnabled }),
    ),
  ];
}

const ALL_ON = {
  enabled: true,
  sharing: { enabled: true, linkEnabled: true, emailEnabled: true },
  signing: { enabled: true },
};

const meta = {
  title: "Config/AdminStorageSharingSection",
  component: AdminStorageSharingSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        ...sectionHandlers({
          storage: ALL_ON,
          frontendUrl: "https://pdf.acme-legal.test",
          mailEnabled: true,
        }),
        http.put("/api/v1/admin/settings/section/storage", () =>
          HttpResponse.json({}),
        ),
        http.put("/api/v1/admin/settings", () => HttpResponse.json({})),
      ],
    },
  },
  decorators: [withProviders(true)],
} satisfies Meta<typeof AdminStorageSharingSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every prerequisite met, so the full chain of switches is on and editable. */
export const Default: Story = {};

/** Storage off — the switches that depend on it are disabled, whatever their stored value. */
export const StorageDisabled: Story = {
  parameters: {
    msw: {
      handlers: sectionHandlers({
        storage: {
          enabled: false,
          sharing: { enabled: true, linkEnabled: true, emailEnabled: true },
          signing: { enabled: true },
        },
        frontendUrl: "https://pdf.acme-legal.test",
        mailEnabled: true,
      }),
    },
  },
};

/**
 * Sharing is on but the frontend URL and mail relay are not configured: both
 * sharing channels are disabled and each shows its "requires…" note.
 */
export const PrerequisitesMissing: Story = {
  parameters: {
    msw: {
      handlers: sectionHandlers({
        storage: {
          enabled: true,
          sharing: { enabled: true, linkEnabled: false, emailEnabled: false },
          signing: { enabled: false },
        },
      }),
    },
  },
};

/** While any of the three settings requests is in flight, a centred loader replaces the form. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/admin/settings/section/storage", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
        http.get("/api/v1/admin/settings/section/system", () =>
          HttpResponse.json({}),
        ),
        http.get("/api/v1/admin/settings/section/mail", () =>
          HttpResponse.json({}),
        ),
      ],
    },
  },
};

/** Restart-required edits: the pending switch positions show with pending badges. */
export const PendingChanges: Story = {
  parameters: {
    msw: {
      handlers: sectionHandlers({
        storage: {
          enabled: true,
          sharing: { enabled: false, linkEnabled: false, emailEnabled: false },
          signing: { enabled: false },
          _pending: {
            sharing: { enabled: true, linkEnabled: true },
            signing: { enabled: true },
          },
        },
        frontendUrl: "https://pdf.acme-legal.test",
        mailEnabled: true,
      }),
    },
  },
};

/** Login mode disabled: nothing is fetched, the banner shows and every switch locks. */
export const LoginDisabled: Story = {
  decorators: [withProviders(false)],
};
