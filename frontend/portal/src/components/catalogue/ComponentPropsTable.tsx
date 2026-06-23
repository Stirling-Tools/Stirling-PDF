import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Chip, Table, type TableColumn } from "@shared/components";
import type { ComponentProp } from "@portal/api/sdkComponents";
import "@portal/views/Components.css";

interface ComponentPropsTableProps {
  props: ComponentProp[];
}

/** Small Props/API reference shown under the detail modal's Props tab. */
export function ComponentPropsTable({ props: rows }: ComponentPropsTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<TableColumn<ComponentProp>[]>(
    () => [
      {
        key: "name",
        header: t("catalogue.props.columns.name"),
        render: (p) => (
          <span className="portal-components__prop-name">{p.name}</span>
        ),
      },
      {
        key: "type",
        header: t("catalogue.props.columns.type"),
        render: (p) => (
          <code className="portal-components__prop-type">{p.type}</code>
        ),
      },
      {
        key: "required",
        header: t("catalogue.props.columns.required"),
        render: (p) =>
          p.required ? (
            <Chip size="sm" tone="amber">
              {t("catalogue.props.required")}
            </Chip>
          ) : (
            <span className="portal-components__muted">
              {t("catalogue.props.optional")}
            </span>
          ),
      },
      {
        key: "description",
        header: t("catalogue.props.columns.description"),
        render: (p) => (
          <span className="portal-components__prop-desc">{p.description}</span>
        ),
      },
    ],
    [t],
  );

  return (
    <Table<ComponentProp>
      columns={columns}
      rows={rows}
      rowKey={(p) => p.name}
    />
  );
}
