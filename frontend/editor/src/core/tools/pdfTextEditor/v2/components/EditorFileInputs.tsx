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
        data-testid="v2-file-input"
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
        data-testid="v2-image-input"
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
