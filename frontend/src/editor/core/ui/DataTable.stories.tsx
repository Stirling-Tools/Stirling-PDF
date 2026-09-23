import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@app/ui/Button";
import { column, DataTable, type DataTableColumn } from "@app/ui/DataTable";

interface Region {
  id: string;
  name: string;
  code: string;
  status: "healthy" | "degraded";
  docs: number;
  latency: number;
  auto: boolean;
}

const REGIONS: Region[] = [
  {
    id: "1",
    name: "US East",
    code: "us-east-1",
    status: "healthy",
    docs: 12481,
    latency: 41,
    auto: true,
  },
  {
    id: "2",
    name: "US West",
    code: "us-west-2",
    status: "healthy",
    docs: 8210,
    latency: 63,
    auto: false,
  },
  {
    id: "3",
    name: "EU West",
    code: "eu-west-1",
    status: "degraded",
    docs: 3044,
    latency: 190,
    auto: true,
  },
  {
    id: "4",
    name: "AP South",
    code: "ap-south-1",
    status: "healthy",
    docs: 5622,
    latency: 88,
    auto: false,
  },
];

const tone = (r: Region) => ({
  tone: r.status === "healthy" ? ("success" as const) : ("warning" as const),
  label: r.status,
});

const COLUMNS: DataTableColumn<Region>[] = [
  column.entity({
    key: "name",
    header: "Region",
    primary: (r) => r.name,
  }),
  column.mono({ key: "code", header: "Code", get: (r) => r.code }),
  column.badge({ key: "status", header: "Status", get: tone }),
  column.number({
    key: "docs",
    header: "Docs 24h",
    get: (r) => r.docs,
    format: (n) => n.toLocaleString(),
  }),
  column.number({
    key: "latency",
    header: "P95",
    get: (r) => r.latency,
    format: (n) => `${n} ms`,
  }),
];

const SORTABLE_COLUMNS: DataTableColumn<Region>[] = [
  column.entity({
    key: "name",
    header: "Region",
    primary: (r) => r.name,
    sortable: true,
  }),
  column.mono({
    key: "code",
    header: "Code",
    get: (r) => r.code,
    sortable: true,
  }),
  column.badge({ key: "status", header: "Status", get: tone, sortable: true }),
  column.number({
    key: "docs",
    header: "Docs 24h",
    get: (r) => r.docs,
    format: (n) => n.toLocaleString(),
    sortable: true,
  }),
  column.number({
    key: "latency",
    header: "P95",
    get: (r) => r.latency,
    format: (n) => `${n} ms`,
    sortable: true,
  }),
];

const meta: Meta<typeof DataTable> = {
  title: "Compound/DataTable",
  component: DataTable,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof DataTable>;

/** Columns come from the `column` vocabulary; call-sites never style a cell. */
export const Basic: Story = {
  render: () => (
    <DataTable<Region> columns={COLUMNS} rows={REGIONS} rowKey={(r) => r.id} />
  ),
};

/** Sorting is opt-in per column (`sortable: true`); click a header. */
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

/** `onRowClick` + a chevron affordance. The line above shows the click land. */
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
              : "Click a row to fire onRowClick."}
          </p>
          <DataTable<Region>
            columns={COLUMNS}
            rows={REGIONS}
            rowKey={(r) => r.id}
            onRowClick={setClicked}
            rowAffordance="chevron"
          />
        </>
      );
    }
    return <Bound />;
  },
};

/** A trailing action column (icon-only kebab), locked to the design system. */
export const WithActions: Story = {
  render: () => (
    <DataTable<Region>
      columns={[
        ...COLUMNS,
        column.actions({
          key: "actions",
          get: () => [
            {
              label: "Row actions",
              glyph: "kebab",
              iconOnly: true,
              onClick: () => {},
            },
          ],
        }),
      ]}
      rows={REGIONS}
      rowKey={(r) => r.id}
    />
  ),
};

/** First-load skeleton mirrors the real column layout. */
export const Loading: Story = {
  render: () => (
    <DataTable<Region>
      columns={COLUMNS}
      rows={[]}
      rowKey={(r) => r.id}
      loading
    />
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

/** The one look choice: the `compact` variant. */
export const Compact: Story = {
  render: () => (
    <DataTable<Region>
      columns={COLUMNS}
      rows={REGIONS}
      rowKey={(r) => r.id}
      variant="compact"
    />
  ),
};
