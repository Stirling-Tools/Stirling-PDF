import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Center,
  Checkbox,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import { formatFileSize } from "@app/utils/fileUtils";

// ─── Inline renderer ──────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++}>{match[3]}</em>);
    else if (match[4])
      parts.push(
        <code
          key={key++}
          style={{
            background: "var(--mantine-color-gray-1)",
            padding: "0 3px",
            borderRadius: 3,
            fontFamily: "monospace",
            fontSize: "0.85em",
          }}
        >
          {match[4]}
        </code>,
      );
    else if (match[5])
      parts.push(
        <a
          key={key++}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--mantine-color-blue-6)" }}
        >
          {match[5]}
        </a>,
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ─── Table helpers ────────────────────────────────────────────────────────────

function parseRow(line: string): string[] {
  const parts = line.split("|");
  return parts.slice(1, parts.length - 1).map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

// ─── Collapsible table ────────────────────────────────────────────────────────

function CollapsibleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Box style={{ margin: "10px 0" }}>
      <Group justify="flex-end" mb={2}>
        <Box
          component="button"
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "0.72em",
            color: "var(--mantine-color-gray-6)",
            padding: "2px 4px",
          }}
        >
          {collapsed ? "▸ Expand" : "▾ Collapse"}
        </Box>
      </Group>

      <Box style={{ borderRadius: 6, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: "0.85em",
            }}
          >
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    style={{
                      border: "1px solid var(--mantine-color-gray-3)",
                      padding: "6px 10px",
                      background: "var(--mantine-color-gray-1)",
                      textAlign: "left",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            {!collapsed && (
              <tbody>
                {rows.map((row, ri) => (
                  <tr
                    key={ri}
                    style={{
                      background: ri % 2 === 0 ? "transparent" : "#F5F5F5",
                    }}
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          border: "1px solid var(--mantine-color-gray-3)",
                          padding: "5px 10px",
                        }}
                      >
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </Box>

      {collapsed && (
        <Text size="xs" c="dimmed" ta="center" mt={4}>
          {rows.length} row{rows.length !== 1 ? "s" : ""} hidden — click ▸ to
          expand
        </Text>
      )}
    </Box>
  );
}

// ─── Copyable code block ──────────────────────────────────────────────────────

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  return (
    <Box style={{ position: "relative", margin: "4px 0" }}>
      <pre
        style={{
          background: "var(--mantine-color-gray-1)",
          padding: "8px 52px 8px 12px",
          borderRadius: 4,
          overflowX: "auto",
          fontSize: "0.85em",
          margin: 0,
        }}
      >
        <code>{code}</code>
      </pre>
      <Box
        component="button"
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          background: copied
            ? "var(--mantine-color-green-0)"
            : "var(--mantine-color-gray-0)",
          border: "1px solid var(--mantine-color-gray-3)",
          borderRadius: 3,
          cursor: "pointer",
          fontSize: "0.7em",
          padding: "2px 8px",
          color: copied
            ? "var(--mantine-color-green-7)"
            : "var(--mantine-color-gray-7)",
          transition: "color 0.15s, background 0.15s",
        }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </Box>
    </Box>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeKey = 0;
  let tableKey = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Code blocks ──
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <CopyableCode
            key={`code-${codeKey++}`}
            code={codeLines.join("\n")}
          />,
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      i++;
      continue;
    }

    // ── Tables ──
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }

      const sepIdx = tableLines.findIndex(isSeparatorRow);
      const headers = tableLines.length > 0 ? parseRow(tableLines[0]) : [];
      const dataStart = sepIdx >= 1 ? sepIdx + 1 : 1;
      const rows = tableLines
        .slice(dataStart)
        .filter((l) => !isSeparatorRow(l))
        .map(parseRow);

      if (headers.length > 0) {
        elements.push(
          <CollapsibleTable
            key={`table-${tableKey++}`}
            headers={headers}
            rows={rows}
          />,
        );
      }
      continue;
    }

    // ── Headings ──
    if (line.startsWith("#### ")) {
      elements.push(
        <Text key={i} fw={600} size="sm" mt="xs" mb={2}>
          {renderInline(line.slice(5))}
        </Text>,
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <Text key={i} fw={600} size="md" mt="xs" mb={2}>
          {renderInline(line.slice(4))}
        </Text>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <Text key={i} fw={700} size="lg" mt="sm" mb={4}>
          {renderInline(line.slice(3))}
        </Text>,
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <Text key={i} fw={800} size="xl" mt="md" mb={6}>
          {renderInline(line.slice(2))}
        </Text>,
      );

      // ── Lists ──
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <Group key={i} gap={6} align="flex-start" style={{ paddingLeft: 16 }}>
          <Text size="sm" style={{ lineHeight: 1.6, flexShrink: 0 }}>
            {"•"}
          </Text>
          <Text size="sm" style={{ lineHeight: 1.6 }}>
            {renderInline(line.slice(2))}
          </Text>
        </Group>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\.\s/)?.[1];
      const rest = line.replace(/^\d+\.\s/, "");
      elements.push(
        <Group key={i} gap={6} align="flex-start" style={{ paddingLeft: 16 }}>
          <Text size="sm" style={{ lineHeight: 1.6, flexShrink: 0 }}>
            {num}.
          </Text>
          <Text size="sm" style={{ lineHeight: 1.6 }}>
            {renderInline(rest)}
          </Text>
        </Group>,
      );

      // ── Dividers / blank lines ──
    } else if (line.trim() === "" || line === "---" || line === "***") {
      elements.push(<Box key={i} style={{ height: 8 }} />);

      // ── Paragraph text ──
    } else {
      elements.push(
        <Text key={i} size="sm" style={{ lineHeight: 1.7 }}>
          {renderInline(line)}
        </Text>,
      );
    }
    i++;
  }

  return elements;
}

// ─── Text / Markdown viewer ───────────────────────────────────────────────────

interface TextViewerProps {
  file: File;
  isMarkdown: boolean;
}

export function TextViewer({ file, isMarkdown }: TextViewerProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(!isMarkdown);
  const [renderMd, setRenderMd] = useState(isMarkdown);

  useEffect(() => {
    file.text().then(setContent);
  }, [file]);

  const lines = content?.split("\n") ?? [];
  const renderedMarkdown = useMemo(
    () =>
      content !== null && isMarkdown && renderMd
        ? renderMarkdown(content)
        : null,
    [content, isMarkdown, renderMd],
  );

  return (
    <Stack gap={0} style={{ height: "100%", flex: 1 }}>
      {/* Toolbar */}
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
            {t("viewer.nonPdf.textStats", {
              lines: lines.length.toLocaleString(),
              size: formatFileSize(file.size),
            })}
          </Text>
          {!isMarkdown && (
            <Checkbox
              label={<Text size="xs">{t("viewer.nonPdf.lineNumbers")}</Text>}
              checked={showLineNumbers}
              onChange={(e) => setShowLineNumbers(e.currentTarget.checked)}
              size="xs"
            />
          )}
          {isMarkdown && (
            <Checkbox
              label={<Text size="xs">{t("viewer.nonPdf.renderMarkdown")}</Text>}
              checked={renderMd}
              onChange={(e) => setRenderMd(e.currentTarget.checked)}
              size="xs"
            />
          )}
        </Group>
      </Paper>

      {/* Content */}
      <ScrollArea style={{ flex: 1 }} p="md">
        {content === null ? (
          <Center>
            <Text c="dimmed" size="sm">
              {t("viewer.nonPdf.loading")}
            </Text>
          </Center>
        ) : renderedMarkdown !== null ? (
          <Box
            style={{
              maxWidth: 800,
              margin: "0 auto",
              padding: "20px 28px",
              background: "#ffffff",
              borderRadius: 6,
            }}
          >
            {renderedMarkdown}
          </Box>
        ) : (
          <Box
            component="pre"
            style={{
              fontFamily: "monospace",
              fontSize: "0.8rem",
              lineHeight: 1.6,
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              display: "table",
              width: "100%",
            }}
          >
            {lines.map((line, idx) => (
              <Box key={idx} component="div" style={{ display: "table-row" }}>
                {showLineNumbers && (
                  <Box
                    component="span"
                    style={{
                      display: "table-cell",
                      paddingRight: 16,
                      paddingLeft: 4,
                      textAlign: "right",
                      color: "var(--mantine-color-gray-5)",
                      userSelect: "none",
                      borderRight: "1px solid var(--mantine-color-gray-2)",
                      minWidth: `${String(lines.length).length + 1}ch`,
                    }}
                  >
                    {idx + 1}
                  </Box>
                )}
                <Box
                  component="span"
                  style={{
                    display: "table-cell",
                    paddingLeft: showLineNumbers ? 12 : 0,
                  }}
                >
                  {line || " "}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </ScrollArea>
    </Stack>
  );
}
