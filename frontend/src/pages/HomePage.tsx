import React, { useState, useCallback } from "react";
import { Box, Group, Container } from "@mantine/core";
import TopControls from "../components/shared/TopControls";
import FileManager from "../components/fileManagement/FileManager";
import FileEditor from "../components/editor/FileEditor";
import PageEditor from "../components/editor/PageEditor";
import PageEditorControls from "../components/editor/PageEditorControls";
import Viewer from "../components/viewer/Viewer";
import FileUploadSelector from "../components/shared/FileUploadSelector";

export default function HomePage() {
  const [files, setFiles] = useState([]); // Array of { file, url }
  const [preSelectedFiles, setPreSelectedFiles] = useState([]);
  const [currentView, setCurrentView] = useState("fileManager");
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [pageEditorFunctions, setPageEditorFunctions] = useState(null);

  // Handle file selection from upload
  const handleFileSelect = useCallback((file) => {
    const fileObj = { file, url: URL.createObjectURL(file) };
    setFiles([fileObj]);
  }, []);

  // Handle opening file editor with selected files
  const handleOpenFileEditor = useCallback((selectedFiles) => {
    setPreSelectedFiles(selectedFiles || []);
    setCurrentView("fileEditor");
  }, []);

  return (
    <Group
      align="flex-start"
      gap={0}
      className="min-h-screen w-screen overflow-hidden flex-nowrap flex"
    >
      <Box
        className="flex-1 h-screen min-w-80 relative flex flex-col"
        style={{
          backgroundColor: 'var(--bg-background)'
        }}
      >
        {/* Top Controls */}
        <TopControls
          currentView={currentView}
          setCurrentView={setCurrentView}
        />
        {/* Main content area */}
        <Box className="flex-1 min-h-0 margin-top-200 relative z-10">
          {currentView === "fileManager" ? (
            <FileManager
              files={files}
              setFiles={setFiles}
              setCurrentView={setCurrentView}
              onOpenFileEditor={handleOpenFileEditor}
            />
          ) : (currentView !== "fileManager") && !files[0] ? (
            <Container size="lg" p="xl" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileUploadSelector
                title={currentView === "viewer" ? "Select a PDF to view" : "Select a PDF to edit"}
                subtitle="Choose a file from storage or upload a new PDF"
                sharedFiles={files}
                onFileSelect={handleFileSelect}
                allowMultiple={false}
                accept={["application/pdf"]}
                loading={false}
              />
            </Container>
          ) : currentView === "fileEditor" ? (
            <FileEditor
              sharedFiles={files}
              setSharedFiles={setFiles}
              preSelectedFiles={preSelectedFiles}
              onClearPreSelection={() => setPreSelectedFiles([])}
              onOpenPageEditor={(file) => {
                const fileObj = { file, url: URL.createObjectURL(file) };
                setFiles([fileObj]);
                setCurrentView("pageEditor");
              }}
              onMergeFiles={(filesToMerge) => {
                setFiles(filesToMerge.map(f => ({ file: f, url: URL.createObjectURL(f) })));
                setCurrentView("viewer");
              }}
            />
          ) : currentView === "viewer" ? (
            <Viewer
              pdfFile={files[0]}
              setPdfFile={(fileObj) => setFiles([fileObj])}
              sidebarsVisible={sidebarsVisible}
              setSidebarsVisible={setSidebarsVisible}
            />
          ) : currentView === "pageEditor" ? (
            <>
              <PageEditor
                file={files[0]}
                setFile={(fileObj) => setFiles([fileObj])}
                downloadUrl={downloadUrl}
                setDownloadUrl={setDownloadUrl}
                onFunctionsReady={setPageEditorFunctions}
                sharedFiles={files}
              />
              {files[0] && pageEditorFunctions && (
                <PageEditorControls
                  onClosePdf={pageEditorFunctions.closePdf}
                  onUndo={pageEditorFunctions.handleUndo}
                  onRedo={pageEditorFunctions.handleRedo}
                  canUndo={pageEditorFunctions.canUndo}
                  canRedo={pageEditorFunctions.canRedo}
                  onRotate={pageEditorFunctions.handleRotate}
                  onDelete={pageEditorFunctions.handleDelete}
                  onSplit={pageEditorFunctions.handleSplit}
                  onExportSelected={() => pageEditorFunctions.showExportPreview(true)}
                  onExportAll={() => pageEditorFunctions.showExportPreview(false)}
                  exportLoading={pageEditorFunctions.exportLoading}
                  selectionMode={pageEditorFunctions.selectionMode}
                  selectedPages={pageEditorFunctions.selectedPages}
                />
              )}
            </>
          ) : (
            <FileManager
              files={files}
              setFiles={setFiles}
              setCurrentView={setCurrentView}
              onOpenFileEditor={handleOpenFileEditor}
            />
          )}
        </Box>
      </Box>
    </Group>
  );
}
