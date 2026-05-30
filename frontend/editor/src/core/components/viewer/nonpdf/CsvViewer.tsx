import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Center,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import SortIcon from "@mui/icons-material/Sort";
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

// ─── CSV viewer ───────────────────────────────────────────────────────────────

interface CsvViewerProps {
  file: File;
  isTsv: boolean;
}

export function CsvViewer({ file, isTsv }: CsvViewerProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    setLoading(true);
    file.text().then((text) => {
      const delimiter = isTsv ? "\t" : ",";
      setRows(parseCsv(text, delimiter));
      setLoading(false);
    });
  }, [file, isTsv]);

  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1);

  const sortedDataRows = useMemo(() => {
    if (sortCol === null) return dataRows;
    return [...dataRows].sort((a, b) => {
      const av = a[sortCol] ?? "";
      const bv = b[sortCol] ?? "";
      const numA = Number(av);
      const numB = Number(bv);
      const cmp =
        !isNaN(numA) && !isNaN(numB) ? numA - numB : av.localeCompare(bv);
      return sortAsc ? cmp : -cmp;
    });
  }, [dataRows, sortCol, sortAsc]);

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      setSortAsc((a) => !a);
    } else {
      setSortCol(colIdx);
      setSortAsc(true);
    }
  };

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
    <Stack gap={0} style={{ height: "100%", flex: 1 }}>
      {/* Stats bar */}
      <Paper
        radius={0}
        p="xs"
        style={{
          borderBottom: "1px solid var(--mantine-color-gray-2)",
          flexShrink: 0,
        }}
      >
        <Group gap="md" align="center">
          <Text size="xs" c="dimmed">
            {t("viewer.nonPdf.csvStats", {
              rows: dataRows.length.toLocaleString(),
              columns: headers.length,
              size: formatFileSize(file.size),
            })}
          </Text>
          {sortCol !== null && (
            <Badge
              variant="light"
              color="teal"
              size="xs"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setSortCol(null);
                setSortAsc(true);
              }}
            >
              {t("viewer.nonPdf.sortedBy", {
                column:
                  headers[sortCol] ||
                  t("viewer.nonPdf.columnDefault", { index: sortCol + 1 }),
              })}{" "}
              {sortAsc ? "\u2191" : "\u2193"} \u2715
            </Badge>
          )}
        </Group>
      </Paper>

      {/* Table */}
      <ScrollArea style={{ flex: 1 }}>
        <Table
          striped
          highlightOnHover
          withColumnBorders
          withTableBorder={false}
          style={{
            fontSize: "var(--mantine-font-size-xs)",
            whiteSpace: "nowrap",
          }}
          stickyHeader
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th
                style={{
                  width: 48,
                  color: "var(--mantine-color-dimmed)",
                  textAlign: "center",
                  paddingInline: 8,
                }}
              >
                #
              </Table.Th>
              {headers.map((h, i) => (
                <Table.Th
                  key={i}
                  style={{ cursor: "pointer", paddingInline: 8 }}
                  onClick={() => handleSort(i)}
                >
                  <Group gap={4} align="center" wrap="nowrap">
                    <Text size="xs" fw={600} truncate style={{ maxWidth: 200 }}>
                      {h || t("viewer.nonPdf.columnDefault", { index: i + 1 })}
                    </Text>
                    <SortIcon
                      style={{
                        fontSize: "0.85rem",
                        opacity: sortCol === i ? 1 : 0.3,
                        color:
                          sortCol === i
                            ? "var(--mantine-color-teal-6)"
                            : undefined,
                        transform:
                          sortCol === i && !sortAsc ? "scaleY(-1)" : undefined,
                      }}
                    />
                  </Group>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedDataRows.map((row, ri) => (
              <Table.Tr key={ri}>
                <Table.Td
                  style={{
                    color: "var(--mantine-color-dimmed)",
                    textAlign: "center",
                    paddingInline: 8,
                  }}
                >
                  {ri + 1}
                </Table.Td>
                {headers.map((_, ci) => (
                  <Table.Td
                    key={ci}
                    style={{ paddingInline: 8, maxWidth: 300 }}
                  >
                    <Text size="xs" truncate title={row[ci]}>
                      {row[ci] ?? ""}
                    </Text>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}
