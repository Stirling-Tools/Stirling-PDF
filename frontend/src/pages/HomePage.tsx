import React, { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import AddToPhotosIcon from "@mui/icons-material/AddToPhotos";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditNoteIcon from "@mui/icons-material/EditNote";
import { Group, SegmentedControl, Paper, Center, Box, Button, useMantineTheme, useMantineColorScheme } from "@mantine/core";

import ToolPicker from "../components/ToolPicker";
import FileManager from "../components/FileManager";
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import MergePdfPanel from "../tools/Merge";
import PageEditor from "../components/PageEditor";
import Viewer from "../components/Viewer";
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';

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

// Utility to extract params for a tool from searchParams
function getToolParams(toolKey: string, searchParams: URLSearchParams) {
  switch (toolKey) {
    case "split":
      return {
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
      };
    case "compress":
      return {
        level: searchParams.get("compressLevel") || "medium",
        keepQuality: searchParams.get("keepQuality") === "true",
      };
    case "merge":
      return {
        order: searchParams.get("mergeOrder") || "default",
        removeDuplicates: searchParams.get("removeDuplicates") === "true",
      };
    // Add more tools here as needed
    default:
      return {};
  }
}

// Utility to update params for a tool
function updateToolParams(toolKey: string, searchParams: URLSearchParams, setSearchParams: any, newParams: any) {
  const params = new URLSearchParams(searchParams);

  // Clear tool-specific params
  if (toolKey === "split") {
    [
      "splitMode", "pages", "hDiv", "vDiv", "merge",
      "splitType", "splitValue", "bookmarkLevel", "includeMetadata", "allowDuplicates"
    ].forEach((k) => params.delete(k));
    // Set new split params
    const merged = { ...getToolParams("split", searchParams), ...newParams };
    params.set("splitMode", merged.mode);
    if (merged.mode === "byPages") params.set("pages", merged.pages);
    else if (merged.mode === "bySections") {
      params.set("hDiv", merged.hDiv);
      params.set("vDiv", merged.vDiv);
      params.set("merge", String(merged.merge));
    } else if (merged.mode === "bySizeOrCount") {
      params.set("splitType", merged.splitType);
      params.set("splitValue", merged.splitValue);
    } else if (merged.mode === "byChapters") {
      params.set("bookmarkLevel", merged.bookmarkLevel);
      params.set("includeMetadata", String(merged.includeMetadata));
      params.set("allowDuplicates", String(merged.allowDuplicates));
    }
  } else if (toolKey === "compress") {
    ["compressLevel", "keepQuality"].forEach((k) => params.delete(k));
    const merged = { ...getToolParams("compress", searchParams), ...newParams };
    params.set("compressLevel", merged.level);
    params.set("keepQuality", String(merged.keepQuality));
  } else if (toolKey === "merge") {
    ["mergeOrder", "removeDuplicates"].forEach((k) => params.delete(k));
    const merged = { ...getToolParams("merge", searchParams), ...newParams };
    params.set("mergeOrder", merged.order);
    params.set("removeDuplicates", String(merged.removeDuplicates));
  }
  // Add more tools as needed

  setSearchParams(params, { replace: true });
}

// List of all tool-specific params
const TOOL_PARAMS = {
  split: [
    "splitMode", "pages", "hDiv", "vDiv", "merge",
    "splitType", "splitValue", "bookmarkLevel", "includeMetadata", "allowDuplicates"
  ],
  compress: [
    "compressLevel", "keepQuality"
  ],
  merge: [
    "mergeOrder", "removeDuplicates"
  ]
  // Add more tools as needed
};

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme(); // <-- Call hook ONCE at the top

  // Core app state
  const [selectedToolKey, setSelectedToolKey] = useState<string>(searchParams.get("tool") || "split");
  const [currentView, setCurrentView] = useState<string>(searchParams.get("view") || "viewer");
  const [pdfFile, setPdfFile] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);

  const toolParams = getToolParams(selectedToolKey, searchParams);

  const updateParams = (newParams: any) =>
    updateToolParams(selectedToolKey, searchParams, setSearchParams, newParams);

  // Update URL when core state changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);

    // Remove all tool-specific params except for the current tool
    Object.entries(TOOL_PARAMS).forEach(([tool, keys]) => {
      if (tool !== selectedToolKey) {
        keys.forEach((k) => params.delete(k));
      }
    });

    // Collect all params except 'view'
    const entries = Array.from(params.entries()).filter(([key]) => key !== "view");

    // Rebuild params with 'view' first
    const newParams = new URLSearchParams();
    newParams.set("view", currentView);
    newParams.set("tool", selectedToolKey);
    entries.forEach(([key, value]) => {
      if (key !== "tool") newParams.set(key, value);
    });

    setSearchParams(newParams, { replace: true });
  }, [selectedToolKey, currentView, setSearchParams, searchParams]);

  // Handle tool selection
  const handleToolSelect = useCallback(
    (id: string) => {
      setSelectedToolKey(id);
      if (toolRegistry[id]?.view) setCurrentView(toolRegistry[id].view);
    },
    [toolRegistry]
  );

  const selectedTool = toolRegistry[selectedToolKey];

  // Tool component rendering
  const renderTool = () => {
    if (!selectedTool || !selectedTool.component) {
      return <div>Tool not found</div>;
    }

    // Pass only the necessary props
    return React.createElement(selectedTool.component, {
      files,
      setDownloadUrl,
      params: toolParams,
      updateParams,
    });
  };

  return (
    <Group
      align="flex-start"
      gap={0}
      style={{
        minHeight: "100vh",
        width: "100vw",
        overflow: "hidden",
        flexWrap: "nowrap",
        display: "flex",
      }}
    >
      {/* Left: Tool Picker */}
      {sidebarsVisible && (
        <Box
          style={{
            minWidth: 180,
            maxWidth: 240,
            width: "16vw",
            height: "100vh",
            borderRight: `1px solid ${colorScheme === "dark" ? theme.colors.dark[4] : "#e9ecef"}`,
            background: colorScheme === "dark" ? theme.colors.dark[7] : "#fff",
            zIndex: 101,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <ToolPicker
            selectedToolKey={selectedToolKey}
            onSelect={handleToolSelect}
            toolRegistry={toolRegistry}
          />
        </Box>
      )}

      {/* Middle: Main View */}
      <Box
        style={{
          flex: 1,
          height: "100vh",
          minWidth:"20rem",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          transition: "all 0.3s",
          background: colorScheme === "dark" ? theme.colors.dark[6] : "#f8f9fa",
        }}
      >
        {/* Overlayed View Switcher */}
        <div
          style={{
            position: "absolute",
            left: 0,
            width: "100%",
            display: "flex",
            justifyContent: "center",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>
            <SegmentedControl
              data={VIEW_OPTIONS}
              value={currentView}
              onChange={setCurrentView}
              color="blue"
              radius="xl"
              size="md"
              fullWidth
            />
          </div>
        </div>
        {/* Main content area */}
        <Paper
          radius="0 0 xl xl"
          shadow="sm"
          p={0}
          style={{
            flex: 1,
            minHeight: 0,
            marginTop: 0,
            boxSizing: "border-box",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box style={{ flex: 1, minHeight: 0 }}>
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
                sidebarsVisible={sidebarsVisible}
                setSidebarsVisible={setSidebarsVisible}
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
        </Paper>
      </Box>

      {/* Right: Tool Interaction */}
      {sidebarsVisible && (
        <Box
          style={{
            minWidth: 260,
            maxWidth: 400,
            width: "22vw",
            height: "100vh",
            borderLeft: `1px solid ${colorScheme === "dark" ? theme.colors.dark[4] : "#e9ecef"}`,
            background: colorScheme === "dark" ? theme.colors.dark[7] : "#fff",
            padding: 24,
            gap: 16,
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {selectedTool && selectedTool.component && renderTool()}
        </Box>
      )}

      {/* Sidebar toggle button */}
      <Button
        variant="light"
        color="blue"
        size="xs"
        style={{ position: "fixed", top: 16, right: 16, zIndex: 200 }}
        onClick={() => setSidebarsVisible((v) => !v)}
      >
        {sidebarsVisible ? "Hide Sidebars" : "Show Sidebars"}
      </Button>
    </Group>
  );
}
