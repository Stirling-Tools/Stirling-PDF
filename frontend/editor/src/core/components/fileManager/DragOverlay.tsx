import React from "react";
import { Stack, Text } from "@mantine/core";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useTranslation } from "react-i18next";

interface DragOverlayProps {
  isVisible: boolean;
}

const DragOverlay: React.FC<DragOverlayProps> = ({ isVisible }) => {
  const { t } = useTranslation();

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // The prompt below is the drop affordance on its own. Tinting the whole
        // region and ringing it in dashed accent reads as a second, competing
        // surface, so the overlay stays transparent.
        borderRadius: "1.875rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      <Stack align="center" gap="md">
        {/* Muted ink rather than the accent shade: it has to read on whatever
            the overlay happens to sit on, in either scheme. */}
        <UploadFileIcon
          style={{ fontSize: "4rem", color: "var(--c-text-muted)" }}
        />
        <Text size="xl" fw={500} c="var(--c-text-muted)">
          {t("fileManager.dropFilesHere", "Drop files here to upload")}
        </Text>
      </Stack>
    </div>
  );
};

export default DragOverlay;
