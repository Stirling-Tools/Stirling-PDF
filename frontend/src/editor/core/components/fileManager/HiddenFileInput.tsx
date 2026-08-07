import React from "react";
import { useFileManagerContext } from "@editor/contexts/FileManagerContext";

const HiddenFileInput: React.FC = () => {
  const { fileInputRef, onFileInputChange } = useFileManagerContext();

  return (
    <input
      ref={fileInputRef}
      type="file"
      multiple={true}
      onChange={onFileInputChange}
      style={{ display: "none" }}
      data-testid="file-input"
    />
  );
};

export default HiddenFileInput;
