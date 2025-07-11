import React from "react";
import { FileWithUrl } from "../../types/file";

interface ToolRendererProps {
  selectedToolKey: string;
  selectedTool: any;
  pdfFile: any;
  files: FileWithUrl[];
  downloadUrl: string | null;
  setDownloadUrl: (url: string | null) => void;
  toolParams: any;
  updateParams: (params: any) => void;
  toolSelectedFiles?: File[];
  onPreviewFile?: (file: File | null) => void;
}

const ToolRenderer = ({
  selectedToolKey,
  selectedTool,
  pdfFile,
  files,
  downloadUrl,
  setDownloadUrl,
  toolParams,
  updateParams,
  toolSelectedFiles = [],
  onPreviewFile,
}: ToolRendererProps) => {
  if (!selectedTool || !selectedTool.component) {
    return <div>Tool not found</div>;
  }

  const ToolComponent = selectedTool.component;

  // Pass tool-specific props
  switch (selectedToolKey) {
    case "split":
      return (
        <ToolComponent
          params={toolParams}
          updateParams={updateParams}
          selectedFiles={toolSelectedFiles}
          onPreviewFile={onPreviewFile}
        />
      );
    case "compress":
      return (
        <ToolComponent
          files={files}
          setDownloadUrl={setDownloadUrl}
          setLoading={(loading: boolean) => {}}
          params={toolParams}
          updateParams={updateParams}
        />
      );
    case "merge":
      return (
        <ToolComponent
          files={files}
          setDownloadUrl={setDownloadUrl}
          params={toolParams}
          updateParams={updateParams}
        />
      );
    default:
      return (
        <ToolComponent
          files={files}
          setDownloadUrl={setDownloadUrl}
          params={toolParams}
          updateParams={updateParams}
        />
      );
  }
};

export default ToolRenderer;