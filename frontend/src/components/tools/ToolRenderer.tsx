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
          file={pdfFile}
          downloadUrl={downloadUrl}
          setDownloadUrl={setDownloadUrl}
          params={toolParams}
          updateParams={updateParams}
        />
      );
    case "compress":
      return (
        <ToolComponent
          files={files}
          setDownloadUrl={setDownloadUrl}
          setLoading={(loading: boolean) => {}} // TODO: Add loading state
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