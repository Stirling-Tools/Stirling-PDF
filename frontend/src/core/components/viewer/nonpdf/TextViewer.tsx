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
import { renderMarkdown } from "@app/components/viewer/nonpdf/MarkdownRenderer";

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
        px="sm"
        style={{
          borderBottom: "1px solid var(--mantine-color-gray-2)",
          flexShrink: 0,
          minHeight: 44,
          display: "flex",
          alignItems: "center",
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
