import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import AdminFolderAccessSection from "@editor/components/shared/config/configSections/AdminFolderAccessSection";
import { AppConfigProvider } from "@editor/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@editor/contexts/UnsavedChangesContext";

/**
 * AdminFolderAccessSection fetches its settings via apiClient on mount (through
 * useAdminSettings, plus its own implied-folder-roots request) rather than
 * taking props, so each story mocks both GETs with MSW. It also reads
 * useAppConfig()/useSettingsDirty(), which throw without their providers, so
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

function impliedRootsHandler(
  roots: { path: string; reason: string }[] = [
    { path: "/srv/stirling/storage", reason: "serverStorage" },
    { path: "/srv/stirling/watched/invoices", reason: "watchedFolder" },
  ],
) {
  return http.get("/api/v1/admin/settings/policies/implied-folder-roots", () =>
    HttpResponse.json(roots),
  );
}

function allowedRootsHandler(allowedFolderRoots: string[]) {
  return http.get("/api/v1/admin/settings/section/policies", () =>
    HttpResponse.json({ allowedFolderRoots }),
  );
}

const meta = {
  title: "Config/AdminFolderAccessSection",
  component: AdminFolderAccessSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        http.put("/api/v1/admin/settings/section/policies", () =>
          HttpResponse.json({}),
        ),
      ],
    },
  },
  decorators: [withProviders(true)],
} satisfies Meta<typeof AdminFolderAccessSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Two allowed folder roots configured, plus the always-allowed implied roots. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        allowedRootsHandler(["/data/inbox", "/data/exports"]),
        impliedRootsHandler(),
      ],
    },
  },
};

/** No folder roots configured yet: folder sources and outputs are disabled. */
export const NoRootsConfigured: Story = {
  parameters: {
    msw: {
      handlers: [allowedRootsHandler([]), impliedRootsHandler([])],
    },
  },
};

/** Login mode disabled: the section is read-only and shows the login-required banner. */
export const LoginDisabled: Story = {
  decorators: [withProviders(false)],
  parameters: {
    msw: {
      handlers: [allowedRootsHandler([]), impliedRootsHandler([])],
    },
  },
};
