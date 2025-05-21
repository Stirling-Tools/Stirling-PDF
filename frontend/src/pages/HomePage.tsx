import React, { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import AddToPhotosIcon from "@mui/icons-material/AddToPhotos";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditNoteIcon from "@mui/icons-material/EditNote";
import { Group, SegmentedControl, Paper, Center, Box } from "@mantine/core";

import ToolPicker from "../components/ToolPicker";
import FileManager from "../components/FileManager";
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import MergePdfPanel from "../tools/Merge";
import PageEditor from "../components/PageEditor";
import Viewer from "../components/Viewer";

type ToolRegistryEntry = {
  icon: React.ReactNode;
  name: string;
  component: React.ComponentType<any>;
  view: string;
};

type ToolRegistry = {
  [key: string]: ToolRegistryEntry;
};

const toolRegistry: ToolRegistry = {
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
  const [searchParams, setSearchParams] = useSearchParams();

  // Core app state
  const [selectedToolKey, setSelectedToolKey] = useState<string>(searchParams.get("tool") || "split");
  const [currentView, setCurrentView] = useState<string>(searchParams.get("view") || "viewer");
  const [pdfFile, setPdfFile] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Tool-specific parameters
  const [splitParams, setSplitParams] = useState({
    mode: searchParams.get("splitMode") || "byPages",
    pages: searchParams.get("pages") || "",
    hDiv: searchParams.get("hDiv") || "0",
    vDiv: searchParams.get("vDiv") || "1",
    merge: searchParams.get("merge") === "true",
    splitType: searchParams.get("splitType") || "size",
    splitValue: searchParams.get("splitValue") || "",
    bookmarkLevel: searchParams.get("bookmarkLevel") || "0",
    includeMetadata: searchParams.get("includeMetadata") === "true",
    allowDuplicates: searchParams.get("allowDuplicates") === "true",
  });

  // Update URL when core state changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set("tool", selectedToolKey);
    params.set("view", currentView);
    setSearchParams(params, { replace: true });
  }, [selectedToolKey, currentView, setSearchParams]);

  // Handle tool selection
  const handleToolSelect = useCallback(
    (id: string) => {
      setSelectedToolKey(id);
      if (toolRegistry[id]?.view) setCurrentView(toolRegistry[id].view);
    },
    [toolRegistry]
  );

  // Handle split parameter updates
  const updateSplitParams = useCallback((newParams: Partial<typeof splitParams>) => {
    setSplitParams(prev => {
      const updated = { ...prev, ...newParams };

      // Update URL with split params
      const params = new URLSearchParams(searchParams);

      // Clear old parameters when mode changes
      if (newParams.mode && newParams.mode !== prev.mode) {
        params.delete("pages");
        params.delete("hDiv");
        params.delete("vDiv");
        params.delete("merge");
        params.delete("splitType");
        params.delete("splitValue");
        params.delete("bookmarkLevel");
        params.delete("includeMetadata");
        params.delete("allowDuplicates");
      }

      // Set the mode
      params.set("splitMode", updated.mode);

      // Set mode-specific parameters
      if (updated.mode === "byPages" && updated.pages) {
        params.set("pages", updated.pages);
      } else if (updated.mode === "bySections") {
        params.set("hDiv", updated.hDiv);
        params.set("vDiv", updated.vDiv);
        params.set("merge", String(updated.merge));
      } else if (updated.mode === "bySizeOrCount") {
        params.set("splitType", updated.splitType);
        if (updated.splitValue) params.set("splitValue", updated.splitValue);
      } else if (updated.mode === "byChapters") {
        params.set("bookmarkLevel", updated.bookmarkLevel);
        params.set("includeMetadata", String(updated.includeMetadata));
        params.set("allowDuplicates", String(updated.allowDuplicates));
      }

      setSearchParams(params, { replace: true });
      return updated;
    });
  }, [searchParams, setSearchParams]);

  const selectedTool = toolRegistry[selectedToolKey];

  // Tool component rendering
  const renderTool = () => {
    if (!selectedTool || !selectedTool.component) {
      return <div>Tool not found</div>;
    }

    // Pass appropriate props based on tool type
    if (selectedToolKey === "split") {
      return React.createElement(selectedTool.component, {
        file: pdfFile,
        setPdfFile,
        downloadUrl,
        setDownloadUrl,
        // Tool-specific params and update function
        params: splitParams,
        updateParams: updateSplitParams
      });
    }

    // For other tools, pass standard props
    return React.createElement(selectedTool.component, {
      file: pdfFile,
      setPdfFile,
      files,
      setFiles,
      downloadUrl,
      setDownloadUrl,
    });
  };


  return (
    <Group align="flex-start" gap={0} style={{ minHeight: "100vh" }}>
      {/* Left: Tool Picker */}
      <ToolPicker
        selectedToolKey={selectedToolKey}
        onSelect={handleToolSelect}
        toolRegistry={toolRegistry}
      />

      {/* Middle: Main View (Viewer, Editor, Manager) */}
      <Box
        style={{
          width: "calc(100vw - 220px - 380px)",
          marginLeft: 220,
          marginRight: 380,
          padding: 24,
          background: "#fff",
          position: "relative",
          minHeight: "100vh",
          height: "100vh",
          overflowY: "auto",
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
              onChange={setCurrentView} // Using the state setter directly
              color="blue"
              radius="xl"
              size="md"
            />
          </Paper>
        </Center>
        <Box>
          {(currentView === "viewer" || currentView === "pageEditor") && !pdfFile ? (
            <FileManager
              files={files}
              setFiles={setFiles}
              setPdfFile={setPdfFile}
              setCurrentView={setCurrentView}
            />
          ) : currentView === "viewer" ? (
            <Viewer
              pdfFile={pdfFile}
              setPdfFile={setPdfFile}
            />
          ) : currentView === "pageEditor" ? (
            <PageEditor
              file={pdfFile}
              setFile={setPdfFile}
              downloadUrl={downloadUrl}
              setDownloadUrl={setDownloadUrl}
            />
          ) : (
            <FileManager
              files={files}
              setFiles={setFiles}
              setPdfFile={setPdfFile}
              setCurrentView={setCurrentView}
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
          gap: 16,
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          overflowY: "auto",
        }}
      >
        {selectedTool && selectedTool.component && (
          <>
            {renderTool()}
          </>
        )}
      </Box>
    </Group>
  );
}
