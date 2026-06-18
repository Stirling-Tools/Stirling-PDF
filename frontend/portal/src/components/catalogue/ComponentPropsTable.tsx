import { useMemo } from "react";
import { Chip, Table, type TableColumn } from "@shared/components";
import type { ComponentProp } from "@portal/api/sdkComponents";
import "@portal/views/Components.css";

interface ComponentPropsTableProps {
  props: ComponentProp[];
}

/** Small Props/API reference shown under the detail modal's Props tab. */
export function ComponentPropsTable({ props: rows }: ComponentPropsTableProps) {
  const columns = useMemo<TableColumn<ComponentProp>[]>(
    () => [
      {
        key: "name",
        header: "Prop",
        render: (p) => (
          <span className="portal-components__prop-name">{p.name}</span>
        ),
      },
      {
        key: "type",
        header: "Type",
        render: (p) => (
          <code className="portal-components__prop-type">{p.type}</code>
        ),
      },
      {
        key: "required",
        header: "Required",
        render: (p) =>
          p.required ? (
            <Chip size="sm" tone="amber">
              required
            </Chip>
          ) : (
            <span className="portal-components__muted">optional</span>
          ),
      },
      {
        key: "description",
        header: "Description",
        render: (p) => (
          <span className="portal-components__prop-desc">{p.description}</span>
        ),
      },
    ],
    [],
  );

  return (
    <Table<ComponentProp>
      columns={columns}
      rows={rows}
      rowKey={(p) => p.name}
    />
  );
}
