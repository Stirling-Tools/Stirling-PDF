interface FileInputsProps {
  onPickImage: (file: File) => void;
}

/** The hidden image picker behind the toolbars' Add image buttons. */
export function EditorFileInputs({ onPickImage }: FileInputsProps) {
  return (
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
  );
}
