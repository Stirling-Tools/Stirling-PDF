import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { SourceModal } from "@portal/components/sources/SourceModal";

/**
 * The create wizard: type catalogue, then (for connection-backed types) the
 * connection step, then the source-only setup. Driven by the shared MSW
 * handlers, so the full flow works in-story including inline connection
 * creation.
 */
const meta: Meta<typeof SourceModal> = {
  title: "Portal/Sources/SourceModal",
  component: SourceModal,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => {
      // The modal reads the shared sources cache; a per-story client mirrors
      // PortalApp's provider (retries off so mock errors surface immediately).
      const [client] = useState(
        () =>
          new QueryClient({ defaultOptions: { queries: { retry: false } } }),
      );
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  args: { open: true, onClose: () => {}, sourceId: null },
};
export default meta;
type Story = StoryObj<typeof SourceModal>;

/** Step 1: the connector catalogue with coming-soon entries. */
export const Create: Story = {};

/** The connection step with no stored connections: opens on the inline form. */
export const CreateNoConnections: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/integrations", () => HttpResponse.json([])),
      ],
    },
  },
};
