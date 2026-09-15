import type { Meta, StoryObj } from "@storybook/react-vite";
import { column, DataTable, type DataTableColumn } from "@app/ui/DataTable";
import {
  DataTableFilterBar,
  useDataTableFilters,
} from "@app/ui/DataTableFilterBar";

interface Incident {
  id: string;
  title: string;
  user: string | null;
  source: string | null;
  kind: string;
  severity: "danger" | "warning" | "info";
}

const INCIDENTS: Incident[] = [
  {
    id: "1",
    title: "Password-protected document",
    user: "dana@acme.com",
    source: null,
    kind: "Input",
    severity: "danger",
  },
  {
    id: "2",
    title: "Password-protected document",
    user: null,
    source: "s3-invoices",
    kind: "Input",
    severity: "danger",
  },
  {
    id: "3",
    title: "Unrecognised failure",
    user: "lee@acme.com",
    source: null,
    kind: "Internal",
    severity: "warning",
  },
  {
    id: "4",
    title: "Delivery refused",
    user: null,
    source: "webhook-erp",
    kind: "Output",
    severity: "danger",
  },
  {
    id: "5",
    title: "Unrecognised failure",
    user: "dana@acme.com",
    source: null,
    kind: "Internal",
    severity: "info",
  },
];

const COLUMNS: DataTableColumn<Incident>[] = [
  column.text({
    key: "title",
    header: "Failure",
    sortable: true,
    get: (r) => r.title,
  }),
  column.badge({
    key: "kind",
    header: "Stage",
    sortable: true,
    get: (r) => ({ tone: r.severity, label: r.kind }),
  }),
  column.muted({
    key: "user",
    header: "User",
    sortable: true,
    get: (r) => r.user,
    placeholder: "-",
  }),
  column.muted({
    key: "source",
    header: "Source",
    sortable: true,
    get: (r) => r.source,
    placeholder: "-",
  }),
];

/** The full pairing: hook owns state + derivation, bar sits in the toolbar. */
function FilteredTable({ rows }: { rows: Incident[] }) {
  const filters = useDataTableFilters({
    rows,
    facets: [
      { key: "type", label: "Type", getValue: (r) => r.title },
      { key: "user", label: "User", getValue: (r) => r.user },
      { key: "source", label: "Source", getValue: (r) => r.source },
      { key: "stage", label: "Stage", getValue: (r) => r.kind },
    ],
    searchText: (r) => [r.title, r.user ?? "", r.source ?? ""].join(" "),
  });

  return (
    <DataTable<Incident>
      columns={COLUMNS}
      rows={filters.rows}
      rowKey={(r) => r.id}
      toolbar={<DataTableFilterBar {...filters.filterBar} />}
      empty="No rows match the current filters"
      caption="Incidents"
    />
  );
}

const meta: Meta<typeof FilteredTable> = {
  title: "Compound/DataTableFilterBar",
  component: FilteredTable,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof FilteredTable>;

export const Default: Story = {
  args: { rows: INCIDENTS },
};

export const Empty: Story = {
  args: { rows: [] },
};
