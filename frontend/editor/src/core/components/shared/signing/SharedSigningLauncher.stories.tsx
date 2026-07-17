import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import SharedSigningLauncher from "@app/components/shared/signing/SharedSigningLauncher";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";
import type { SignRequestSummary } from "@app/types/signingSession";

/**
 * Reads server config via AppConfigContext (whether group signing is enabled)
 * and tool selection via ToolWorkflowContext (the "Open shared signing" click
 * target) — matching the provider nesting AppProviders.tsx sets up above it.
 */
function withProviders(groupSigningEnabled: boolean) {
  return function Decorator(Story: () => React.JSX.Element) {
    return (
      <AppConfigProvider
        autoFetch={false}
        initialConfig={{ storageGroupSigningEnabled: groupSigningEnabled }}
      >
        <PreferencesProvider>
          <ToolRegistryProvider>
            <NavigationProvider>
              <ToolWorkflowProvider>
                <Story />
              </ToolWorkflowProvider>
            </NavigationProvider>
          </ToolRegistryProvider>
        </PreferencesProvider>
      </AppConfigProvider>
    );
  };
}

const meta = {
  title: "Shared/Signing/SharedSigningLauncher",
  component: SharedSigningLauncher,
} satisfies Meta<typeof SharedSigningLauncher>;
export default meta;

type Story = StoryObj<typeof meta>;

const noSignRequests: SignRequestSummary[] = [];

const pendingSignRequests: SignRequestSummary[] = [
  {
    sessionId: "session-1",
    documentName: "NDA-acme-corp.pdf",
    ownerUsername: "alex",
    createdAt: "2026-07-01T09:00:00Z",
    dueDate: "2026-07-20T00:00:00Z",
    myStatus: "PENDING",
  },
  {
    sessionId: "session-2",
    documentName: "vendor-agreement.pdf",
    ownerUsername: "jordan",
    createdAt: "2026-07-05T14:30:00Z",
    dueDate: "2026-07-22T00:00:00Z",
    myStatus: "VIEWED",
  },
];

/** Group signing enabled, no sign requests awaiting the user's action. */
export const Default: Story = {
  decorators: [withProviders(true)],
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/security/cert-sign/sign-requests", () =>
          HttpResponse.json(noSignRequests),
        ),
        http.get("/api/v1/security/cert-sign/sessions", () =>
          HttpResponse.json([]),
        ),
      ],
    },
  },
};

/** Two sign requests awaiting this user — the count badge appears on the button. */
export const PendingRequests: Story = {
  decorators: [withProviders(true)],
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/security/cert-sign/sign-requests", () =>
          HttpResponse.json(pendingSignRequests),
        ),
        http.get("/api/v1/security/cert-sign/sessions", () =>
          HttpResponse.json([]),
        ),
      ],
    },
  },
};

/** Group signing disabled on the server — the component renders nothing. */
export const Disabled: Story = {
  decorators: [withProviders(false)],
};
