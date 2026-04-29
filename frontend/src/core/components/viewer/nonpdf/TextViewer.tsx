import React, { useEffect, useState } from "react";
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

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Patterns: **bold**, *italic*, `code`, [link](url)
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

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={i}
            style={{
              background: "var(--mantine-color-gray-1)",
              padding: "8px 12px",
              borderRadius: 4,
              overflowX: "auto",
              fontSize: "0.85em",
              margin: "4px 0",
            }}
          >
            <code>{codeLines.join("\n")}</code>
          </pre>,
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

    if (line.startsWith("### ")) {
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
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <Group key={i} gap={6} align="flex-start" style={{ paddingLeft: 16 }}>
          <Text size="sm" style={{ lineHeight: 1.6, flexShrink: 0 }}>
            {"\u2022"}
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
    } else if (line.trim() === "" || line === "---" || line === "***") {
      elements.push(<Box key={i} style={{ height: 8 }} />);
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
        ) : isMarkdown && renderMd ? (
          <Box style={{ maxWidth: 800, margin: "0 auto", padding: "8px 0" }}>
            {renderMarkdown(content)}
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
            {lines.map((line, i) => (
              <Box key={i} component="div" style={{ display: "table-row" }}>
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
                    {i + 1}
                  </Box>
                )}
                <Box
                  component="span"
                  style={{
                    display: "table-cell",
                    paddingLeft: showLineNumbers ? 12 : 0,
                  }}
                >
                  {line || "\u00A0"}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </ScrollArea>
    </Stack>
  );
}
