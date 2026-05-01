import { useState, useCallback } from "react";
import {
  Modal,
  Badge,
  Text,
  Group,
  Box,
  Stack,
  Loader,
  Alert,
  Tabs,
  Code,
  ScrollArea,
} from "@mantine/core";
import { Dropzone as MantineDropzone } from "@mantine/dropzone";
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { getAuthHeaders } from "@app/services/apiClientSetup";

interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export function ContentInspectorModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setPages([]);
    setFileName(file.name);

    try {
      const form = new FormData();
      form.append("fileInput", file);
      const res = await fetch("/api/v1/ai/debug/extract-text", {
        method: "POST",
        body: form,
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = (await res.json()) as {
        pageCount: number;
        pages: ExtractedPage[];
      };
      setPages(data.pages ?? []);
    } catch (e) {
      setError((e as Error).message ?? "Extraction failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClose = () => {
    setPages([]);
    setError(null);
    setFileName(null);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap={6}>
          <ManageSearchIcon sx={{ fontSize: 18 }} />
          <Text fw={600} size="sm">
            Content Inspector
          </Text>
          {fileName && (
            <Badge
              size="xs"
              variant="light"
              maw={200}
              style={{ overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {fileName}
            </Badge>
          )}
        </Group>
      }
      size="xl"
      styles={{ body: { padding: 0 } }}
    >
      {pages.length === 0 && !loading && !error && (
        <Box p="md">
          <MantineDropzone
            onDrop={handleDrop}
            accept={["application/pdf"]}
            maxFiles={1}
            loading={loading}
            style={{ minHeight: 140 }}
          >
            <Stack
              align="center"
              justify="center"
              gap="xs"
              style={{ minHeight: 120 }}
            >
              <UploadFileIcon sx={{ fontSize: 36, opacity: 0.4 }} />
              <Text size="sm" c="dimmed">
                Drop a PDF here to see raw extracted text
              </Text>
              <Text size="xs" c="dimmed">
                Uses the same pipeline as the AI engine
              </Text>
            </Stack>
          </MantineDropzone>
        </Box>
      )}

      {loading && (
        <Stack align="center" py="xl" gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Extracting…
          </Text>
        </Stack>
      )}

      {error && (
        <Box p="md">
          <Alert
            icon={<ErrorOutlineIcon sx={{ fontSize: 16 }} />}
            color="red"
            title="Extraction failed"
            variant="light"
          >
            {error}
          </Alert>
          <Box mt="sm">
            <MantineDropzone
              onDrop={handleDrop}
              accept={["application/pdf"]}
              maxFiles={1}
              style={{ minHeight: 80 }}
            >
              <Stack
                align="center"
                justify="center"
                gap={4}
                style={{ minHeight: 60 }}
              >
                <Text size="xs" c="dimmed">
                  Try another PDF
                </Text>
              </Stack>
            </MantineDropzone>
          </Box>
        </Box>
      )}

      {pages.length > 0 && (
        <Box
          style={{ height: "70vh", display: "flex", flexDirection: "column" }}
        >
          <Tabs
            defaultValue={String(pages[0].pageNumber)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
            styles={{ panel: { flex: 1, minHeight: 0, overflow: "hidden" } }}
          >
            <Box
              style={{
                borderBottom: "1px solid var(--mantine-color-default-border)",
                overflowX: "auto",
                flexShrink: 0,
              }}
            >
              <Tabs.List style={{ flexWrap: "nowrap" }}>
                {pages.map((p) => (
                  <Tabs.Tab
                    key={p.pageNumber}
                    value={String(p.pageNumber)}
                    fz="xs"
                  >
                    p.{p.pageNumber}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Box>

            {pages.map((p) => (
              <Tabs.Panel
                key={p.pageNumber}
                value={String(p.pageNumber)}
                style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
              >
                <ScrollArea style={{ height: "100%" }} p="md">
                  <Code
                    block
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: "0.75rem",
                    }}
                  >
                    {p.text || "(no extractable text on this page)"}
                  </Code>
                </ScrollArea>
              </Tabs.Panel>
            ))}
          </Tabs>
        </Box>
      )}
    </Modal>
  );
}
