import type { Meta, StoryObj } from "@storybook/react-vite";
import { ApiKeyCard } from "@portal/components/infrastructure/ApiKeyCard";
import type { ApiKey } from "@portal/api/infrastructure";
import "@portal/views/Infrastructure.css";

const BASE: ApiKey = {
  id: "key-1",
  name: "Production · ingest",
  prefix: "sk_a3f81b2c",
  scope: "personal",
  teamName: null,
  created: "2026-03-02",
  lastUsed: "2026-07-10 09:14",
  status: "active",
  usageToday: 84210,
  usageMonth: 2410933,
  canManage: true,
};

const meta: Meta<typeof ApiKeyCard> = {
  title: "Portal/Infrastructure/ApiKeyCard",
  component: ApiKeyCard,
  parameters: { layout: "padded" },
  args: { onRevoke: (id: string) => console.log("revoke", id) },
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

export const Personal: Story = { args: { apiKey: BASE } };

export const TeamMembers: Story = {
  args: {
    apiKey: {
      ...BASE,
      name: "Team · shared ingest",
      scope: "team-members",
      teamName: "Acme Corp",
    },
  },
};

export const TeamLeadOnly: Story = {
  args: {
    apiKey: {
      ...BASE,
      name: "Ops · leaders only",
      scope: "team-lead",
      teamName: "Acme Corp",
      usageToday: 0,
    },
  },
};

export const Revoked: Story = {
  args: {
    apiKey: {
      ...BASE,
      name: "Sandbox · webhook tester",
      prefix: "sk_2c4a91de",
      status: "revoked",
      lastUsed: "Never",
      usageToday: 0,
      usageMonth: 0,
    },
  },
};
