import React, { useState } from "react";
import {
  Paper, Button, Group, Text, Stack, Center, Checkbox, ScrollArea, Box, Tooltip, ActionIcon, Notification
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import AddIcon from "@mui/icons-material/Add";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import DownloadIcon from "@mui/icons-material/Download";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";

export interface PageEditorProps {
  file: { file: File; url: string } | null;
  setFile?: (file: { file: File; url: string } | null) => void;
  downloadUrl?: string | null;
  setDownloadUrl?: (url: string | null) => void;
}

const DUMMY_PAGE_COUNT = 8; // Replace with real page count from PDF

const PageEditor: React.FC<PageEditorProps> = ({
  file,
  setFile,
  downloadUrl,
  setDownloadUrl,
}) => {
  const { t } = useTranslation();
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [undoStack, setUndoStack] = useState<number[][]>([]);
  const [redoStack, setRedoStack] = useState<number[][]>([]);

  // Dummy page thumbnails
  const pages = Array.from({ length: DUMMY_PAGE_COUNT }, (_, i) => i + 1);

  const selectAll = () => setSelectedPages(pages);
  const deselectAll = () => setSelectedPages([]);
  const togglePage = (page: number) =>
    setSelectedPages((prev) =>
      prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page]
    );

  // Undo/redo logic for selection
  const handleUndo = () => {
    if (undoStack.length > 0) {
      setRedoStack([selectedPages, ...redoStack]);
      setSelectedPages(undoStack[0]);
      setUndoStack(undoStack.slice(1));
    }
  };
  const handleRedo = () => {
    if (redoStack.length > 0) {
      setUndoStack([selectedPages, ...undoStack]);
      setSelectedPages(redoStack[0]);
      setRedoStack(redoStack.slice(1));
    }
  };

  // Example action handlers (replace with real API calls)
  const handleRotateLeft = () => setStatus(t("pageEditor.rotatedLeft", "Rotated left: ") + selectedPages.join(", "));
  const handleRotateRight = () => setStatus(t("pageEditor.rotatedRight", "Rotated right: ") + selectedPages.join(", "));
  const handleDelete = () => setStatus(t("pageEditor.deleted", "Deleted: ") + selectedPages.join(", "));
  const handleMoveLeft = () => setStatus(t("pageEditor.movedLeft", "Moved left: ") + selectedPages.join(", "));
  const handleMoveRight = () => setStatus(t("pageEditor.movedRight", "Moved right: ") + selectedPages.join(", "));
  const handleSplit = () => setStatus(t("pageEditor.splitAt", "Split at: ") + selectedPages.join(", "));
  const handleInsertPageBreak = () => setStatus(t("pageEditor.insertedPageBreak", "Inserted page break at: ") + selectedPages.join(", "));
  const handleAddFile = () => setStatus(t("pageEditor.addFileNotImplemented", "Add file not implemented in demo"));

  if (!file) {
    return (
      <Paper shadow="xs" radius="md" p="md">
        <Center>
          <Text color="dimmed">{t("pageEditor.noPdfLoaded", "No PDF loaded. Please upload a PDF to edit.")}</Text>
        </Center>
      </Paper>
    );
  }

  return (
    <Paper shadow="xs" radius="md" p="md">
      <Group align="flex-start" gap="lg">
        {/* Sidebar */}
        <Stack w={180} gap="xs">
          <Text fw={600} size="lg">{t("pageEditor.title", "PDF Multitool")}</Text>
          <Button onClick={selectAll} fullWidth variant="light">{t("multiTool.selectAll", "Select All")}</Button>
          <Button onClick={deselectAll} fullWidth variant="light">{t("multiTool.deselectAll", "Deselect All")}</Button>
          <Button onClick={handleUndo} leftSection={<UndoIcon fontSize="small" />} fullWidth disabled={undoStack.length === 0}>{t("multiTool.undo", "Undo")}</Button>
          <Button onClick={handleRedo} leftSection={<RedoIcon fontSize="small" />} fullWidth disabled={redoStack.length === 0}>{t("multiTool.redo", "Redo")}</Button>
          <Button onClick={handleAddFile} leftSection={<AddIcon fontSize="small" />} fullWidth>{t("multiTool.addFile", "Add File")}</Button>
          <Button onClick={handleInsertPageBreak} leftSection={<ContentCutIcon fontSize="small" />} fullWidth>{t("multiTool.insertPageBreak", "Insert Page Break")}</Button>
          <Button onClick={handleSplit} leftSection={<ContentCutIcon fontSize="small" />} fullWidth>{t("multiTool.split", "Split")}</Button>
          <Button
            component="a"
            href={downloadUrl || "#"}
            download="edited.pdf"
            leftSection={<DownloadIcon fontSize="small" />}
            fullWidth
            color="green"
            variant="light"
            disabled={!downloadUrl}
          >
            {t("multiTool.downloadAll", "Download All")}
          </Button>
          <Button
            component="a"
            href={downloadUrl || "#"}
            download="selected.pdf"
            leftSection={<DownloadIcon fontSize="small" />}
            fullWidth
            color="blue"
            variant="light"
            disabled={!downloadUrl || selectedPages.length === 0}
          >
            {t("multiTool.downloadSelected", "Download Selected")}
          </Button>
          <Button
            color="red"
            variant="light"
            onClick={() => setFile && setFile(null)}
            fullWidth
          >
            {t("pageEditor.closePdf", "Close PDF")}
          </Button>
        </Stack>

        {/* Main multitool area */}
        <Box style={{ flex: 1 }}>
          <Group mb="sm">
            <Tooltip label={t("multiTool.rotateLeft", "Rotate Left")}>
              <ActionIcon onClick={handleRotateLeft} disabled={selectedPages.length === 0} color="blue" variant="light">
                <RotateLeftIcon />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("multiTool.rotateRight", "Rotate Right")}>
              <ActionIcon onClick={handleRotateRight} disabled={selectedPages.length === 0} color="blue" variant="light">
                <RotateRightIcon />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("delete", "Delete")}>
              <ActionIcon onClick={handleDelete} disabled={selectedPages.length === 0} color="red" variant="light">
                <DeleteIcon />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("multiTool.moveLeft", "Move Left")}>
              <ActionIcon onClick={handleMoveLeft} disabled={selectedPages.length === 0} color="gray" variant="light">
                <ArrowBackIosNewIcon />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("multiTool.moveRight", "Move Right")}>
              <ActionIcon onClick={handleMoveRight} disabled={selectedPages.length === 0} color="gray" variant="light">
                <ArrowForwardIosIcon />
              </ActionIcon>
            </Tooltip>
          </Group>
          <ScrollArea h={350}>
            <Group>
              {pages.map((page) => (
                <Stack key={page} align="center" gap={2}>
                  <Checkbox
                    checked={selectedPages.includes(page)}
                    onChange={() => togglePage(page)}
                    label={t("page", "Page") + ` ${page}`}
                  />
                  <Box
                    w={60}
                    h={80}
                    bg={selectedPages.includes(page) ? "blue.1" : "gray.1"}
                    style={{ border: "1px solid #ccc", borderRadius: 4 }}
                  >
                    {/* Replace with real thumbnail */}
                    <Center h="100%">
                      <Text size="xs" color="dimmed">
                        {page}
                      </Text>
                    </Center>
                  </Box>
                </Stack>
              ))}
            </Group>
          </ScrollArea>
        </Box>
      </Group>
      {status && (
        <Notification color="blue" mt="md" onClose={() => setStatus(null)}>
          {status}
        </Notification>
      )}
    </Paper>
  );
};

export default PageEditor;
