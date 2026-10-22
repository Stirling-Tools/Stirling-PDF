import React, { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Center, Group, Paper, Stack, Text } from "@mantine/core";
import {
  type ColumnDef,
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { formatFileSize } from "@app/utils/fileUtils";

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i++;
    } else if (ch === "\n" || ch === "\r") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Remove trailing empty row
  if (rows.length > 0 && rows[rows.length - 1].every((f) => f === "")) {
    rows.pop();
  }
  return rows;
}

// ─── CSV Table Features ───────────────────────────────────────────────────────

const CSV_TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

type CsvRowData = {
  __index: number;
  cells: string[];
};

const ROW_HEIGHT_PX = 32;

// ─── CSV viewer ───────────────────────────────────────────────────────────────

interface CsvViewerProps {
  file: File;
  isTsv: boolean;
}

export function CsvViewer({ file, isTsv }: CsvViewerProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setSorting([]);
    file.text().then((text) => {
      const delimiter = isTsv ? "\t" : ",";
      setRows(parseCsv(text, delimiter));
      setLoading(false);
    });
  }, [file, isTsv]);

  const headers = rows[0] ?? [];

  const tableData = useMemo<CsvRowData[]>(() => {
    return rows.slice(1).map((cells, i) => ({
      __index: i + 1,
      cells,
    }));
  }, [rows]);

  const columns = useMemo<
    ColumnDef<typeof CSV_TABLE_FEATURES, CsvRowData>[]
  >(() => {
    const helper = createColumnHelper<typeof CSV_TABLE_FEATURES, CsvRowData>();
    const cols: ColumnDef<typeof CSV_TABLE_FEATURES, CsvRowData>[] = [
      helper.display({
        id: "__index",
        header: "#",
        cell: (info) => info.row.original.__index,
        enableSorting: false,
      }),
    ];

    headers.forEach((h, colIdx) => {
      cols.push(
        helper.accessor((row: CsvRowData): unknown => row.cells[colIdx] ?? "", {
          id: `col_${colIdx}`,
          header: () =>
            h || t("viewer.nonPdf.columnDefault", { index: colIdx + 1 }),
          cell: (info) => String(info.getValue() ?? ""),
          enableSorting: true,
          sortFn: "alphanumeric",
        }),
      );
    });

    return cols;
  }, [headers, t]);

  const table = useTable({
    features: CSV_TABLE_FEATURES,
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => String(row.__index),
  });

  const sortedRows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 20,
  });

  const sortedColumn = sorting[0];
  const sortedColumnIndex = sortedColumn
    ? parseInt(sortedColumn.id.replace("col_", ""), 10)
    : null;

  if (loading) {
    return (
      <Center style={{ flex: 1 }}>
        <Text c="dimmed" size="sm">
          {t("viewer.nonPdf.loading")}
        </Text>
      </Center>
    );
  }

  if (rows.length === 0) {
    return (
      <Center style={{ flex: 1 }}>
        <Text c="dimmed" size="sm">
          {t("viewer.nonPdf.emptyFile")}
        </Text>
      </Center>
    );
  }

  return (
    <Stack gap={0} style={{ height: "100%", flex: 1, minHeight: 0 }}>
      {/* Stats bar */}
      <Paper
        radius={0}
        p="xs"
        style={{
          borderBottom: "1px solid var(--c-border)",
          backgroundColor: "var(--c-surface)",
          flexShrink: 0,
        }}
      >
        <Group gap="md" align="center">
          <Text size="xs" c="dimmed">
            {t("viewer.nonPdf.csvStats", {
              rows: tableData.length.toLocaleString(),
              columns: headers.length,
              size: formatFileSize(file.size),
            })}
          </Text>
          {sortedColumnIndex !== null && !isNaN(sortedColumnIndex) && (
            <Badge
              variant="light"
              color="teal"
              size="xs"
              style={{ cursor: "pointer" }}
              onClick={() => setSorting([])}
            >
              {t("viewer.nonPdf.sortedBy", {
                column:
                  headers[sortedColumnIndex] ||
                  t("viewer.nonPdf.columnDefault", {
                    index: sortedColumnIndex + 1,
                  }),
              })}{" "}
              {sortedColumn?.desc ? "\u2193" : "\u2191"} \u2715
            </Badge>
          )}
        </Group>
      </Paper>

      {/* TanStack Table with virtualized scrolling */}
      <div
        ref={parentRef}
        style={{
          flex: 1,
          overflow: "auto",
          position: "relative",
          backgroundColor: "var(--c-bg)",
        }}
      >
        <table
          style={{
            width: "max-content",
            minWidth: "100%",
            borderCollapse: "collapse",
            fontSize: "var(--mantine-font-size-xs)",
            whiteSpace: "nowrap",
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              backgroundColor: "var(--c-surface-raised)",
              boxShadow: "0 1px 0 var(--c-border)",
            }}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isIndex = header.id === "__index";
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      style={{
                        padding: "6px 10px",
                        textAlign: isIndex ? "center" : "left",
                        width: isIndex ? 52 : undefined,
                        cursor: canSort ? "pointer" : "default",
                        userSelect: "none",
                        fontWeight: 600,
                        color: isIndex
                          ? "var(--c-text-muted)"
                          : "var(--c-text)",
                        borderRight: "1px solid var(--c-border)",
                        backgroundColor: "var(--c-surface-raised)",
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <Group
                        gap={4}
                        align="center"
                        wrap="nowrap"
                        justify={isIndex ? "center" : "flex-start"}
                      >
                        <Text
                          size="xs"
                          fw={600}
                          truncate
                          style={{ maxWidth: 260 }}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </Text>
                        {canSort && (
                          <Icon
                            name="list-sort-descending"
                            size="0.85rem"
                            style={{
                              opacity: sortDir ? 1 : 0.25,
                              color: sortDir
                                ? "var(--c-accent-fg, var(--c-primary))"
                                : undefined,
                              transform:
                                sortDir === "asc" ? "scaleY(-1)" : undefined,
                            }}
                          />
                        )}
                      </Group>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    height: `${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px`,
                    padding: 0,
                    border: "none",
                  }}
                />
              </tr>
            )}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = sortedRows[virtualRow.index];
              if (!row) return null;
              return (
                <tr
                  key={row.id}
                  style={{
                    height: `${ROW_HEIGHT_PX}px`,
                    backgroundColor:
                      virtualRow.index % 2 === 1
                        ? "var(--c-hover)"
                        : "transparent",
                    borderBottom: "1px solid var(--c-border)",
                  }}
                >
                  {row.getAllCells().map((cell) => {
                    const isIndex = cell.column.id === "__index";
                    return (
                      <td
                        key={cell.id}
                        style={{
                          padding: "4px 10px",
                          textAlign: isIndex ? "center" : "left",
                          color: isIndex
                            ? "var(--c-text-muted)"
                            : "var(--c-text)",
                          borderRight: "1px solid var(--c-border)",
                          maxWidth: 360,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        <Text
                          size="xs"
                          truncate
                          title={String(cell.getValue() ?? "")}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </Text>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    height: `${
                      rowVirtualizer.getTotalSize() -
                      (rowVirtualizer.getVirtualItems()[
                        rowVirtualizer.getVirtualItems().length - 1
                      ]?.end ?? 0)
                    }px`,
                    padding: 0,
                    border: "none",
                  }}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Stack>
  );
}
