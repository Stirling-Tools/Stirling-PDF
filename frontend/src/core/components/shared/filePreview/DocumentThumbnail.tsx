import React from "react";
import { Box, Center, Loader, Stack, Text } from "@mantine/core";
import LockIcon from "@mui/icons-material/Lock";
import { getFileTypeIcon } from "@app/components/shared/filePreview/getFileTypeIcon";
import { StirlingFileStub } from "@app/types/fileContext";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { detectFileExtension } from "@app/utils/fileUtils";

export interface DocumentThumbnailProps {
  file: File | StirlingFileStub | null;
  thumbnail?: string | null;
  isEncrypted?: boolean;
  isLoading?: boolean;
  iconSize?: string | number;
  imgClassName?: string;
  onImageError?: React.ReactEventHandler<HTMLImageElement>;
  style?: React.CSSProperties;
  onClick?: () => void;
  children?: React.ReactNode;
}

const DocumentThumbnail: React.FC<DocumentThumbnailProps> = ({
  file,
  thumbnail,
  isEncrypted = false,
  isLoading = false,
  iconSize = "4rem",
  imgClassName,
  onImageError,
  style = {},
  onClick,
  children,
}) => {
  if (!file) return null;

  const containerStyle: React.CSSProperties = {
    position: "relative",
    cursor: onClick ? "pointer" : "default",
    transition: "opacity 0.2s ease",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...style,
  };

  if (thumbnail && !isEncrypted) {
    return (
      <Box style={containerStyle} onClick={onClick}>
        <PrivateContent>
          <img
            src={thumbnail}
            alt={`Preview of ${file.name}`}
            className={imgClassName}
            style={
              imgClassName
                ? undefined
                : {
                    maxWidth: "100%",
                    maxHeight: "100%",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                  }
            }
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={onImageError}
          />
        </PrivateContent>
        {children}
      </Box>
    );
  }

  if (isEncrypted) {
    return (
      <Box style={containerStyle} onClick={onClick}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "calc(100% - 8px)",
            height: "calc(100% - 8px)",
            gap: "0.5rem",
            border: "2px dashed var(--mantine-color-red-5)",
            borderRadius: "10px",
          }}
        >
          <LockIcon
            style={{ fontSize: iconSize, color: "var(--mantine-color-red-6)" }}
          />
          <span
            style={{
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--mantine-color-red-6)",
              background: "rgba(220,38,38,0.1)",
              padding: "2px 8px",
              borderRadius: "6px",
            }}
          >
            Locked
          </span>
        </div>
        {children}
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box style={containerStyle} onClick={onClick}>
        <Stack
          align="center"
          justify="center"
          gap="xs"
          style={{ height: "100%" }}
        >
          <Loader size="sm" />
          <Text size="xs" c="dimmed">
            Loading thumbnail...
          </Text>
        </Stack>
        {children}
      </Box>
    );
  }

  const ext = detectFileExtension(file.name ?? "").toUpperCase();

  return (
    <Box style={containerStyle} onClick={onClick}>
      <Center
        style={{
          width: "100%",
          height: "100%",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <PrivateContent>{getFileTypeIcon(file, iconSize)}</PrivateContent>
        {ext && (
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
              background: "rgb(var(--border))",
              padding: "3px 10px",
              borderRadius: "6px",
            }}
          >
            {ext}
          </span>
        )}
      </Center>
      {children}
    </Box>
  );
};

export default DocumentThumbnail;
