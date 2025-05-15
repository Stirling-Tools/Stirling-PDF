import React, { useState } from "react";
import AddToPhotosIcon from "@mui/icons-material/AddToPhotos";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditNoteIcon from "@mui/icons-material/EditNote";
import { Group, SegmentedControl, Paper, Center, Stack, Button, Text, Box } from "@mantine/core";

import FileManager from "../components/FileManager";
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import MergePdfPanel from "../tools/Merge";
import PageEditor from "../components/PageEditor";
import Viewer from "../components/Viewer";

const toolRegistry = {
  split: { icon: <ContentCutIcon />, name: "Split PDF", component: SplitPdfPanel, view: "viewer" },
  compress: { icon: <ZoomInMapIcon />, name: "Compress PDF", component: CompressPdfPanel, view: "viewer" },
  merge: { icon: <AddToPhotosIcon />, name: "Merge PDFs", component: MergePdfPanel, view: "fileManager" },
};

const VIEW_OPTIONS = [
  {
    label: (
      <Group gap={4}>
        <VisibilityIcon fontSize="small" />
      </Group>
    ),
    value: "viewer",
  },
  {
    label: (
      <Group gap={4}>
        <EditNoteIcon fontSize="small" />
      </Group>
    ),
    value: "pageEditor",
  },
  {
    label: (
      <Group gap={4}>
        <InsertDriveFileIcon fontSize="small" />
      </Group>
    ),
    value: "fileManager",
  },
];

export default function HomePage() {
  const [selectedToolKey, setSelectedToolKey] = useState("split");
  const [currentView, setCurrentView] = useState("viewer");
  const [pdfFile, setPdfFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const selectedTool = toolRegistry[selectedToolKey];

  return (
    <Group align="flex-start" spacing={0} style={{ minHeight: "100vh" }}>
      {/* Left: Tool Picker */}
      <Box
        style={{
          width: 220,
          background: "#f8f9fa",
          borderRight: "1px solid #e9ecef",
          minHeight: "100vh",
          padding: 16,
        }}
      >
        <Text size="lg" weight={500} mb="md">
          Tools
        </Text>
        <Stack spacing="sm">
          {Object.entries(toolRegistry).map(([id, { icon, name }]) => (
            <Button
              key={id}
              variant={selectedToolKey === id ? "filled" : "subtle"}
              leftIcon={icon}
              onClick={() => {
                setSelectedToolKey(id);
                if (toolRegistry[id].view) setCurrentView(toolRegistry[id].view);
              }}
              fullWidth
              size="md"
              radius="md"
            >
              {name}
            </Button>
          ))}
        </Stack>
      </Box>

      {/* Middle: Main View (Viewer, Editor, Manager) */}
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          padding: 24,
          background: "#fff",
          minHeight: "100vh",
          position: "relative",
        }}
      >
        <Center>
          <Paper
            radius="xl"
            shadow="sm"
            p={4}
            style={{
              display: "inline-block",
              marginTop: 8,
              marginBottom: 24,
              background: "#f8f9fa",
              zIndex: 10,
            }}
          >
            <SegmentedControl
              data={VIEW_OPTIONS}
              value={currentView}
              onChange={setCurrentView}
              color="blue"
              radius="xl"
              size="md"
            />
          </Paper>
        </Center>
        <Box>
          {currentView === "viewer" && (
            <Viewer
              file={pdfFile}
              setFile={setPdfFile}
              downloadUrl={downloadUrl}
              setDownloadUrl={setDownloadUrl}
            />
          )}
          {currentView === "pageEditor" && (
            <PageEditor
              file={pdfFile}
              setFile={setPdfFile}
              downloadUrl={downloadUrl}
              setDownloadUrl={setDownloadUrl}
            />
          )}
          {currentView === "fileManager" && (
            <FileManager
              files={files}
              setFiles={setFiles}
              setPdfFile={setPdfFile}
            />
          )}
        </Box>
      </Box>

      {/* Right: Tool Interaction */}
      <Box
        style={{
          width: 380,
          background: "#f8f9fa",
          borderLeft: "1px solid #e9ecef",
          minHeight: "100vh",
          padding: 24,
        }}
      >
        {selectedTool && selectedTool.component && (
          <Paper p="md" radius="md" shadow="xs">
            {React.createElement(selectedTool.component, {
              file: pdfFile,
              setPdfFile,
              files,
              setFiles,
              downloadUrl,
              setDownloadUrl,
            })}
          </Paper>
        )}
      </Box>
    </Group>
  );
}
