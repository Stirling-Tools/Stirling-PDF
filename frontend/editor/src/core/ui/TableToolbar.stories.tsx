import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TableToolbar } from "@app/ui/TableToolbar";
import { Table, type TableColumn } from "@app/ui/Table";
import { StatusBadge } from "@app/ui/StatusBadge";

const meta: Meta<typeof TableToolbar> = {
  title: "Compound/TableToolbar",
  component: TableToolbar,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof TableToolbar>;

interface Row {
  id: string;
  name: string;
  status: "active" | "idle";
}

const ROWS: Row[] = [
  { id: "1", name: "Contract Review", status: "active" },
  { id: "2", name: "Accounts Payable", status: "active" },
  { id: "3", name: "Patient Intake", status: "idle" },
];

const COLUMNS: TableColumn<Row>[] = [
  { key: "name", header: "Name", render: (r) => <strong>{r.name}</strong> },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <StatusBadge
        variant="subtle"
        size="sm"
        tone={r.status === "active" ? "success" : "neutral"}
      >
        {r.status === "active" ? "Active" : "Idle"}
      </StatusBadge>
    ),
  },
];

function Bound({ attached = false }: { attached?: boolean }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const rows = useMemo(
    () =>
      ROWS.filter((r) => filter === "all" || r.status === filter).filter((r) =>
        r.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [filter, search],
  );
  return (
    <div>
      <TableToolbar
        filters={[
          { key: "all", label: "All", count: ROWS.length },
          { key: "active", label: "Active", count: 2 },
          { key: "idle", label: "Idle", count: 1 },
        ]}
        activeFilter={filter}
        onFilterChange={setFilter}
        filterAriaLabel="Filter rows"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search rows"
        attached={attached}
      />
      <Table<Row>
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        empty="No rows match."
      />
    </div>
  );
}

/** Detached: a free-standing control row above any content. */
export const Default: Story = {
  render: () => <Bound />,
};

/** Attached: the toolbar renders as the table card's own top row. */
export const AttachedToTable: Story = {
  render: () => <Bound attached />,
};

/** Search-only: chips omitted, the input keeps to the right edge. */
export const SearchOnly: Story = {
  render: () => (
    <TableToolbar
      search=""
      onSearchChange={() => {}}
      searchPlaceholder="Search documents"
    />
  ),
};
