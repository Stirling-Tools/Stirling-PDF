import type { Meta, StoryObj } from "@storybook/react-vite";
import { Table, type TableColumn } from "@shared/components/Table";
import { StatusBadge } from "@shared/components/StatusBadge";

interface Region {
  id: string;
  name: string;
  code: string;
  status: "healthy" | "degraded";
  docs: number;
  latency: string;
}

const REGIONS: Region[] = [
  {
    id: "1",
    name: "US East",
    code: "us-east-1",
    status: "healthy",
    docs: 12481,
    latency: "41 ms",
  },
  {
    id: "2",
    name: "US West",
    code: "us-west-2",
    status: "healthy",
    docs: 8210,
    latency: "63 ms",
  },
  {
    id: "3",
    name: "EU West",
    code: "eu-west-1",
    status: "degraded",
    docs: 3044,
    latency: "190 ms",
  },
];

const COLUMNS: TableColumn<Region>[] = [
  { key: "name", header: "Region", render: (r) => r.name },
  {
    key: "code",
    header: "Code",
    render: (r) => (
      <code style={{ fontFamily: "var(--font-mono)" }}>{r.code}</code>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <StatusBadge
        tone={r.status === "healthy" ? "success" : "warning"}
        size="sm"
      >
        {r.status}
      </StatusBadge>
    ),
  },
  {
    key: "docs",
    header: "Docs 24h",
    align: "right",
    render: (r) => r.docs.toLocaleString(),
  },
  { key: "latency", header: "P95", align: "right", render: (r) => r.latency },
];

const meta: Meta<typeof Table> = {
  title: "Compound/Table",
  component: Table,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Table>;

/** Presentational table — columns own their cell renderers; pass pre-sorted rows. */
export const Basic: Story = {
  render: () => (
    <Table<Region> columns={COLUMNS} rows={REGIONS} rowKey={(r) => r.id} />
  ),
};

/** With `onRowClick`, rows become focusable + hoverable (keyboard: Enter/Space). */
export const Interactive: Story = {
  render: () => (
    <Table<Region>
      columns={COLUMNS}
      rows={REGIONS}
      rowKey={(r) => r.id}
      onRowClick={() => {}}
    />
  ),
};

/** Empty body slot. */
export const Empty: Story = {
  render: () => (
    <Table<Region>
      columns={COLUMNS}
      rows={[]}
      rowKey={(r) => r.id}
      empty="No regions deployed yet."
    />
  ),
};
