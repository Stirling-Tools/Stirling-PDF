import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { StorageTab } from "@portal/components/infrastructure/StorageTab";
import type { StorageConfig } from "@portal/api/infrastructure";
import "@portal/views/Infrastructure.css";

const meta: Meta<typeof StorageTab> = {
  title: "Portal/Infrastructure/StorageTab",
  component: StorageTab,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof StorageTab>;

export const Default: Story = {};

const OVER_CAP: StorageConfig = {
  usedGb: 1920,
  quotaGb: 2000,
  retention: "180",
  providers: [
    {
      id: "stirling",
      name: "Stirling Cloud",
      kind: "stirling",
      connected: true,
      detail: "Primary vault · us-east-1",
      usedGb: 1532,
    },
    {
      id: "s3",
      name: "Amazon S3",
      kind: "s3",
      connected: true,
      detail: "s3://acme-prod-archive · WORM",
      usedGb: 388,
    },
    {
      id: "azure",
      name: "Azure Blob",
      kind: "azure",
      connected: false,
      detail: "Not connected",
      usedGb: 0,
    },
  ],
};

// Quota nearly exhausted — exercises the danger threshold on the usage bar.
export const OverThreshold: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/infrastructure/storage", () =>
          HttpResponse.json(OVER_CAP),
        ),
      ],
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/infrastructure/storage", async () => {
          await delay("infinite");
          return HttpResponse.json(null);
        }),
      ],
    },
  },
};
