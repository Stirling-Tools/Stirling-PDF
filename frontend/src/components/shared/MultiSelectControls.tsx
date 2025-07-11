import React from "react";
import { Box, Group, Text, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface MultiSelectControlsProps {
  selectedCount: number;
  onClearSelection: () => void;
  onOpenInFileEditor?: () => void;
  onOpenInPageEditor?: () => void;
  onAddToUpload?: () => void; // New action for recent files
}

const MultiSelectControls = ({
  selectedCount,
  onClearSelection,
  onOpenInFileEditor,
  onOpenInPageEditor,
  onAddToUpload
}: MultiSelectControlsProps) => {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  return (
    <Box mb="md" p="md" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderRadius: 8 }}>
      <Group justify="space-between">
        <Text size="sm">
          {selectedCount} {t("fileManager.filesSelected", "files selected")}
        </Text>
        <Group>
          <Button
            size="xs"
            variant="light"
            onClick={onClearSelection}
          >
            {t("fileManager.clearSelection", "Clear Selection")}
          </Button>
          
          {onAddToUpload && (
            <Button
              size="xs"
              color="green"
              onClick={onAddToUpload}
            >
              {t("fileManager.addToUpload", "Add to Upload")}
            </Button>
          )}
          
          {onOpenInFileEditor && (
            <Button
              size="xs"
              color="orange"
              onClick={onOpenInFileEditor}
              disabled={selectedCount === 0}
            >
              {t("fileManager.openInFileEditor", "Open in File Editor")}
            </Button>
          )}
          
          {onOpenInPageEditor && (
            <Button
              size="xs"
              color="blue"
              onClick={onOpenInPageEditor}
              disabled={selectedCount === 0}
            >
              {t("fileManager.openInPageEditor", "Open in Page Editor")}
            </Button>
          )}
        </Group>
      </Group>
    </Box>
  );
};

export default MultiSelectControls;