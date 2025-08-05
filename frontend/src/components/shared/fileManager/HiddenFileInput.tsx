import React from 'react';

interface HiddenFileInputProps {
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const HiddenFileInput: React.FC<HiddenFileInputProps> = ({ fileInputRef, onFileInputChange }) => {
  return (
    <input
      ref={fileInputRef}
      type="file"
      multiple={true}
      accept={["*/*"].join(',')}
      onChange={onFileInputChange}
      style={{ display: 'none' }}
      data-testid="file-input"
    />
  );
};

export default HiddenFileInput;