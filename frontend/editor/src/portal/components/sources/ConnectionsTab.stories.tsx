import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { ConnectionsTab } from "@portal/components/sources/ConnectionsTab";
import type { IntegrationConfig } from "@portal/api/integrations";

const meta = {
  title: "Portal/Sources/ConnectionsTab",
  component: ConnectionsTab,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ConnectionsTab>;
export default meta;
type Story = StoryObj<typeof meta>;

function connection(
  overrides: Partial<IntegrationConfig> & { id: number; name: string },
): IntegrationConfig {
  return {
    integrationType: "S3",
    scope: "TEAM",
    ownerUserId: null,
    ownerTeamId: 1,
    enabled: true,
    locked: false,
    defaultAccess: "READ_WRITE",
    config: { bucket: "stirling-inbox", region: "us-east-1" },
    canManage: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const CONNECTIONS: IntegrationConfig[] = [
  connection({
    id: 1,
    name: "Claims intake bucket",
    config: { bucket: "acme-claims-intake", region: "us-east-1" },
  }),
  connection({
    id: 2,
    name: "Archive reprocess bucket",
    config: { bucket: "acme-archive", region: "eu-west-2" },
  }),
  connection({
    id: 3,
    name: "Shared team bucket",
    config: { bucket: "acme-shared", region: "us-east-1" },
    canManage: false,
  }),
];

/** A handful of stored S3 connections — the common case. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/integrations", () => HttpResponse.json(CONNECTIONS)),
      ],
    },
  },
};

/** No connections yet — shows the empty state with its own "New" action. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/integrations", () => HttpResponse.json([])),
      ],
    },
  },
};

/** Still fetching — the skeleton rows render in place of the table. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/integrations", async () => {
          await delay("infinite");
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};

/** Fetch fails — the inline error banner renders above the (empty) table area. */
export const LoadError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(
          "*/api/v1/integrations",
          () => new HttpResponse(null, { status: 500 }),
        ),
      ],
    },
  },
};
