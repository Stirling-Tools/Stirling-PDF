interface FileInputsProps {
  onPickPdf: (file: File) => void;
  onPickImage: (file: File) => void;
}

/** Hidden file inputs used by the toolbar buttons, drag-and-drop, and tests. */
export function EditorFileInputs({ onPickPdf, onPickImage }: FileInputsProps) {
  return (
    <>
      <input
        type="file"
        accept="application/pdf"
        data-testid="pdf-editor-file-input"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickPdf(file);
          e.target.value = "";
        }}
      />
      <input
        type="file"
        accept="image/*"
        data-testid="pdf-editor-image-input"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickImage(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
