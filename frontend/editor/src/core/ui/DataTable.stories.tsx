import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@app/ui/Button";
import { DataTable, type DataTableColumn } from "@app/ui/DataTable";
import { StatusBadge } from "@app/ui/StatusBadge";

interface Region {
  id: string;
  name: string;
  code: string;
  status: "healthy" | "degraded";
  docs: number;
  latency: number;
}

const REGIONS: Region[] = [
  { id: "1", name: "US East", code: "us-east-1", status: "healthy", docs: 12481, latency: 41 },
  { id: "2", name: "US West", code: "us-west-2", status: "healthy", docs: 8210, latency: 63 },
  { id: "3", name: "EU West", code: "eu-west-1", status: "degraded", docs: 3044, latency: 190 },
  { id: "4", name: "AP South", code: "ap-south-1", status: "healthy", docs: 5622, latency: 88 },
];

const COLUMNS: DataTableColumn<Region>[] = [
  { key: "name", header: "Region", render: (r) => r.name },
  {
    key: "code",
    header: "Code",
    render: (r) => <code style={{ fontFamily: "var(--font-mono)" }}>{r.code}</code>,
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <StatusBadge tone={r.status === "healthy" ? "success" : "warning"} size="sm">
        {r.status}
      </StatusBadge>
    ),
  },
  { key: "docs", header: "Docs 24h", align: "right", render: (r) => r.docs.toLocaleString() },
  { key: "latency", header: "P95", align: "right", render: (r) => `${r.latency} ms` },
];

/** Same columns, but sortable — sort values are explicit so any cell shape can sort. */
const SORTABLE_COLUMNS: DataTableColumn<Region>[] = [
  { key: "name", header: "Region", render: (r) => r.name, sortable: true, sortValue: (r) => r.name },
  {
    key: "code",
    header: "Code",
    render: (r) => <code style={{ fontFamily: "var(--font-mono)" }}>{r.code}</code>,
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <StatusBadge tone={r.status === "healthy" ? "success" : "warning"} size="sm">
        {r.status}
      </StatusBadge>
    ),
    sortable: true,
    sortValue: (r) => r.status,
  },
  {
    key: "docs",
    header: "Docs 24h",
    align: "right",
    render: (r) => r.docs.toLocaleString(),
    sortable: true,
    sortValue: (r) => r.docs,
  },
  {
    key: "latency",
    header: "P95",
    align: "right",
    render: (r) => `${r.latency} ms`,
    sortable: true,
    sortValue: (r) => r.latency,
  },
];

const meta: Meta<typeof DataTable> = {
  title: "Compound/DataTable",
  component: DataTable,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof DataTable>;

/** Presentational — columns own their cell renderers. Card-wrapped by default. */
export const Basic: Story = {
  render: () => <DataTable<Region> columns={COLUMNS} rows={REGIONS} rowKey={(r) => r.id} />,
};

/** Opt-in per-column sorting. Click a header; `sortValue` drives the order. */
export const Sortable: Story = {
  render: () => (
    <DataTable<Region>
      columns={SORTABLE_COLUMNS}
      rows={REGIONS}
      rowKey={(r) => r.id}
      defaultSort={{ key: "docs", direction: "desc" }}
    />
  ),
};

/**
 * With `onRowClick`, rows become focusable + hoverable and fire on click or
 * Enter/Space. The line above updates so you can see the click land.
 */
export const Interactive: Story = {
  render: () => {
    function Bound() {
      const [clicked, setClicked] = useState<Region | null>(null);
      return (
        <>
          <p
            style={{
              marginBottom: "0.75rem",
              fontSize: "0.8125rem",
              color: "var(--c-text-muted)",
            }}
          >
            {clicked
              ? `Clicked: ${clicked.name} (${clicked.code})`
              : "Click a row — it fires onRowClick."}
          </p>
          <DataTable<Region>
            columns={COLUMNS}
            rows={REGIONS}
            rowKey={(r) => r.id}
            onRowClick={setClicked}
          />
        </>
      );
    }
    return <Bound />;
  },
};

/** First-load skeleton mirrors the real column layout. */
export const Loading: Story = {
  render: () => (
    <DataTable<Region> columns={COLUMNS} rows={[]} rowKey={(r) => r.id} loading />
  ),
};

/** Standardized empty slot. */
export const Empty: Story = {
  render: () => (
    <DataTable<Region>
      columns={COLUMNS}
      rows={[]}
      rowKey={(r) => r.id}
      empty="No regions deployed yet."
    />
  ),
};

/** Standardized error slot (announced as an alert). */
export const ErrorState: Story = {
  render: () => (
    <DataTable<Region>
      columns={COLUMNS}
      rows={[]}
      rowKey={(r) => r.id}
      error="Couldn't load regions. Try again."
    />
  ),
};

/** Optional toolbar slot above the table, inside the surface. */
export const WithToolbar: Story = {
  render: () => (
    <DataTable<Region>
      columns={COLUMNS}
      rows={REGIONS}
      rowKey={(r) => r.id}
      toolbar={
        <>
          <strong style={{ fontSize: "0.8125rem" }}>Regions</strong>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" size="sm">
            Export
          </Button>
        </>
      }
    />
  ),
};

/** Compact density + bare (no card). */
export const CompactBare: Story = {
  render: () => (
    <DataTable<Region>
      columns={COLUMNS}
      rows={REGIONS}
      rowKey={(r) => r.id}
      density="compact"
      card={false}
    />
  ),
};
