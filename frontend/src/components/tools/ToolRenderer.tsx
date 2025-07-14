import { FileWithUrl } from "../../types/file";
import { useToolManagement } from "../../hooks/useToolManagement";

interface ToolRendererProps {
  selectedToolKey: string;
  pdfFile: any;
  files: FileWithUrl[];
  toolParams: any;
  updateParams: (params: any) => void;
  toolSelectedFiles?: File[];
  onPreviewFile?: (file: File | null) => void;
}

const ToolRenderer = ({
  selectedToolKey,
files,
  toolParams,
  updateParams,
  toolSelectedFiles = [],
  onPreviewFile,
}: ToolRendererProps) => {
  // Get the tool from registry
  const { toolRegistry } = useToolManagement();
  const selectedTool = toolRegistry[selectedToolKey];

  if (!selectedTool || !selectedTool.component) {
    return <div>Tool not found: {selectedToolKey}</div>;
  }

  const ToolComponent = selectedTool.component;

  // Pass tool-specific props
  switch (selectedToolKey) {
    case "split":
      return (
        <ToolComponent
          selectedFiles={toolSelectedFiles}
          onPreviewFile={onPreviewFile}
        />
      );
    case "compress":
      return (
        <ToolComponent
          files={files}
          setLoading={(loading: boolean) => {}}
          params={toolParams}
          updateParams={updateParams}
        />
      );
    case "merge":
      return (
        <ToolComponent
          files={files}
          params={toolParams}
          updateParams={updateParams}
        />
      );
    default:
      return (
        <ToolComponent
          files={files}
          params={toolParams}
          updateParams={updateParams}
        />
      );
  }
};

export default ToolRenderer;
