import React from "react";
import { Group, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { Button } from "@shared/components/Button";
import { ActionIcon } from "@shared/components/ActionIcon";

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
            <LocalIcon
              icon="undo"
              width={20}
              height={20}
              style={{ color: "currentColor" }}
            />
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
            <LocalIcon
              icon="redo"
              width={20}
              height={20}
              style={{ color: "currentColor" }}
            />
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
