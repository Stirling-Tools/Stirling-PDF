import React from "react";
import { Group, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import RedoIcon from "@mui/icons-material/Redo";
import UndoIcon from "@mui/icons-material/Undo";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";

interface DrawingControlsProps {
  onUndo?: () => void;
  onRedo?: () => void;
  onPlaceSignature?: () => void;
  hasSignatureData?: boolean;
  disabled?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  showPlaceButton?: boolean;
  placeButtonText?: string;
  additionalControls?: React.ReactNode;
}

export const DrawingControls: React.FC<DrawingControlsProps> = ({
  onUndo,
  onRedo,
  onPlaceSignature,
  hasSignatureData = false,
  disabled = false,
  canUndo = true,
  canRedo = true,
  showPlaceButton = true,
  placeButtonText = "Update and Place",
  additionalControls,
}) => {
  const { t } = useTranslation();
  const undoDisabled = disabled || !canUndo;
  const redoDisabled = disabled || !canRedo;

  return (
    <Group gap="xs" wrap="nowrap" align="center">
      {onUndo && (
        <Tooltip label={t("sign.undo", "Undo")}>
          <ActionIcon
            variant="tertiary"
            size="lg"
            aria-label={t("sign.undo", "Undo")}
            onClick={onUndo}
            disabled={undoDisabled}
          >
            <UndoIcon sx={{ color: "currentColor", fontSize: 20 }} />
          </ActionIcon>
        </Tooltip>
      )}
      {onRedo && (
        <Tooltip label={t("sign.redo", "Redo")}>
          <ActionIcon
            variant="tertiary"
            size="lg"
            aria-label={t("sign.redo", "Redo")}
            onClick={onRedo}
            disabled={redoDisabled}
          >
            <RedoIcon sx={{ color: "currentColor", fontSize: 20 }} />
          </ActionIcon>
        </Tooltip>
      )}

      {additionalControls}

      {/* Place Signature Button */}
      {showPlaceButton && onPlaceSignature && (
        <Button
          onClick={onPlaceSignature}
          disabled={disabled || !hasSignatureData}
          style={{ marginLeft: "auto" }}
        >
          {placeButtonText}
        </Button>
      )}
    </Group>
  );
};
