import { useEffect, useState } from "react";
import { Box } from "@mantine/core";

interface ImageViewerProps {
  file: File;
  fileName: string;
}

export function ImageViewer({ file, fileName }: ImageViewerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <Box
      style={{
        flex: 1,
        overflow: "hidden",
        background: "var(--mantine-color-gray-1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {objectUrl && (
        <img
          src={objectUrl}
          alt={fileName}
          draggable={false}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
      )}
    </Box>
  );
}
