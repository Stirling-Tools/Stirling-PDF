import type { Meta, StoryObj } from "@storybook/react-vite";
import { ApiKeyCard } from "@portal/components/infrastructure/ApiKeyCard";
import type { ApiKey } from "@portal/api/infrastructure";
import "@portal/views/Infrastructure.css";

const BASE: ApiKey = {
  id: "key-1",
  name: "Production · ingest",
  prefix: "sk_live_a3f8…",
  created: "Mar 2, 2026",
  lastUsed: "2m ago",
  status: "active",
  rateLimit: 1200,
  permissions: ["Read", "Write"],
  allowedIps: ["52.14.0.0/16", "18.221.0.0/16"],
  usageToday: 84210,
  usageMonth: 2410933,
};

const meta: Meta<typeof ApiKeyCard> = {
  title: "Portal/Infrastructure/ApiKeyCard",
  component: ApiKeyCard,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "44rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ApiKeyCard>;

export const Active: Story = { args: { apiKey: BASE } };

export const RotateSoon: Story = {
  args: {
    apiKey: {
      ...BASE,
      name: "Ops · admin (legacy)",
      status: "rotate-soon",
      permissions: ["Read", "Write", "Admin"],
      allowedIps: ["203.0.113.7/32"],
      usageToday: 0,
    },
  },
};

export const Revoked: Story = {
  args: {
    apiKey: {
      ...BASE,
      name: "Sandbox · webhook tester",
      prefix: "sk_test_2c4a…",
      status: "revoked",
      lastUsed: "never",
      permissions: ["Read"],
      allowedIps: [],
      usageToday: 0,
      usageMonth: 0,
    },
  },
};

export const NoIpAllowlist: Story = {
  args: { apiKey: { ...BASE, allowedIps: [] } },
};
