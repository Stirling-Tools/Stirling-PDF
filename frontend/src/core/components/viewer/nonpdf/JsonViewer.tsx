import { useEffect, useState } from "react";
import { Box, Center, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface JsonViewerProps {
  file: File;
}

export function JsonViewer({ file }: JsonViewerProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [isInvalidJson, setIsInvalidJson] = useState(false);

  useEffect(() => {
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text);
        setContent(JSON.stringify(parsed, null, 2));
        setIsInvalidJson(false);
      } catch (_e) {
        // Show raw content if JSON is invalid
        setContent(text);
        setIsInvalidJson(true);
      }
    });
  }, [file]);

  if (content === null) {
    return (
      <Center style={{ flex: 1 }}>
        <Text c="dimmed" size="sm">
          {t("viewer.nonPdf.loading")}
        </Text>
      </Center>
    );
  }

  return (
    <Stack gap={0} style={{ height: "100%", flex: 1 }}>
      {isInvalidJson && (
        <Paper
          radius={0}
          p="xs"
          style={{
            borderBottom: "1px solid var(--mantine-color-red-2)",
            background: "var(--mantine-color-red-0)",
            flexShrink: 0,
          }}
        >
          <Text size="xs" c="red">
            {t("viewer.nonPdf.invalidJson")}
          </Text>
        </Paper>
      )}
      <ScrollArea style={{ flex: 1 }} type="auto">
        <Box
          component="pre"
          style={{
            margin: 0,
            padding: "var(--mantine-spacing-sm)",
            fontFamily: "monospace",
            fontSize: "0.8rem",
            lineHeight: 1.6,
            whiteSpace: "pre",
            overflowX: "auto",
          }}
        >
          {content}
        </Box>
      </ScrollArea>
    </Stack>
  );
}
