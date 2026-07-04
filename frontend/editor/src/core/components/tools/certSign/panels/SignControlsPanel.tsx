import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import DrawIcon from "@mui/icons-material/Draw";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import CheckIcon from "@mui/icons-material/Check";
import AddIcon from "@mui/icons-material/Add";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

import {
  DEFAULT_PARAMETERS,
  type SignParameters,
} from "@app/hooks/tools/sign/useSignParameters";
import {
  useSavedSignatures,
  type SavedSignature,
} from "@app/hooks/tools/sign/useSavedSignatures";
import { SignatureCreationStep } from "@app/components/tools/certSign/steps/SignatureCreationStep";
import { type SignatureType } from "@app/components/shared/wetSignature/SignatureTypeSelector";

interface SignControlsPanelProps {
  placementMode: boolean;
  onPlacementModeChange: (active: boolean) => void;
  onSignatureSelected: (config: SignParameters) => void;
  onComplete: () => void;
  canComplete: boolean;
  signatureConfig: SignParameters | null;
  hasSelectedAnnotation?: boolean;
  onDeleteSelected?: () => void;
}

// wetSignature creation type ↔ stored/placement signature type.
const STORED_TYPE: Record<SignatureType, SavedSignature["type"]> = {
  draw: "canvas",
  upload: "image",
  type: "text",
};

/** Vertical sidebar signing controls: pick/create a signature, toggle place/move, delete, and complete & sign (placement happens on the main Viewer). */
export default function SignControlsPanel({
  placementMode,
  onPlacementModeChange,
  onSignatureSelected,
  onComplete,
  canComplete,
  signatureConfig,
  hasSelectedAnnotation = false,
  onDeleteSelected,
}: SignControlsPanelProps) {
  const { t } = useTranslation();
  const {
    savedSignatures,
    addSignature,
    removeSignature,
    isAtCapacity,
    byTypeCounts,
  } = useSavedSignatures();

  // Create-signature modal state (reuses the shared wet-signature creation flow).
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<SignatureType>("draw");
  const [createSignature, setCreateSignature] = useState<string | null>(null);
  const [textValue, setTextValue] = useState("");
  const [fontFamily, setFontFamily] = useState(
    DEFAULT_PARAMETERS.fontFamily ?? "Helvetica",
  );
  const [fontSize, setFontSize] = useState(DEFAULT_PARAMETERS.fontSize ?? 16);
  const [textColor, setTextColor] = useState(
    DEFAULT_PARAMETERS.textColor ?? "#000000",
  );

  const renderSavedSignaturePreview = useCallback(
    (sig: SavedSignature) => {
      if (sig.type === "text") {
        return (
          <Box
            style={{
              width: 72,
              height: 28,
              backgroundColor: "#ffffff",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 8px",
              overflow: "hidden",
            }}
          >
            <Text
              size="sm"
              style={{
                fontFamily: sig.fontFamily,
                color: sig.textColor,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {sig.signerName}
            </Text>
          </Box>
        );
      }

      return (
        <Box
          style={{
            width: 72,
            height: 28,
            backgroundColor: "#ffffff",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2px 6px",
          }}
        >
          <Box
            component="img"
            src={sig.dataUrl}
            alt={
              sig.label ||
              t("certSign.collab.signRequest.saved.defaultLabel", "Signature")
            }
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        </Box>
      );
    },
    [t],
  );

  const sortedSavedSignatures = useMemo(() => {
    if (!savedSignatures.length) return [];
    return [...savedSignatures].sort(
      (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
    );
  }, [savedSignatures]);

  const beginPlacement = useCallback(
    (config: SignParameters) => {
      onSignatureSelected({ ...DEFAULT_PARAMETERS, ...config });
      onPlacementModeChange(true);
    },
    [onSignatureSelected, onPlacementModeChange],
  );

  // Auto-select the most recent saved signature on first open.
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    if (!sortedSavedSignatures.length) return;
    if (signatureConfig?.signatureData) return;

    hasAutoSelected.current = true;
    const lastSig = sortedSavedSignatures[0];
    if (lastSig.type === "text") {
      onSignatureSelected({
        ...DEFAULT_PARAMETERS,
        signatureType: "text",
        signerName: lastSig.signerName,
        fontFamily: lastSig.fontFamily,
        fontSize: lastSig.fontSize,
        textColor: lastSig.textColor,
        signatureData: lastSig.dataUrl,
      });
    } else {
      onSignatureSelected({
        ...DEFAULT_PARAMETERS,
        signatureType: lastSig.type,
        signatureData: lastSig.dataUrl,
      });
    }
  }, [
    sortedSavedSignatures,
    signatureConfig?.signatureData,
    onSignatureSelected,
  ]);

  const applySavedSignature = useCallback(
    (sig: SavedSignature) => {
      if (sig.type === "text") {
        beginPlacement({
          signatureType: "text",
          signerName: sig.signerName,
          fontFamily: sig.fontFamily,
          fontSize: sig.fontSize,
          textColor: sig.textColor,
          signatureData: sig.dataUrl,
        });
        return;
      }
      beginPlacement({ signatureType: sig.type, signatureData: sig.dataUrl });
    },
    [beginPlacement],
  );

  const openCreateModal = useCallback(() => {
    setCreateType("draw");
    setCreateSignature(null);
    setTextValue("");
    setCreateOpen(true);
  }, []);

  // Save the freshly created signature to the library, then begin placing it.
  const handleUseCreated = useCallback(async () => {
    if (!createSignature) return;
    const storedType = STORED_TYPE[createType];
    const isText = storedType === "text";

    if (!isAtCapacity) {
      const index = (byTypeCounts?.[storedType] ?? 0) + 1;
      const baseLabel = isText
        ? t(
            "certSign.collab.signRequest.saved.defaultTextLabel",
            "Typed signature",
          )
        : storedType === "image"
          ? t(
              "certSign.collab.signRequest.saved.defaultImageLabel",
              "Uploaded signature",
            )
          : t(
              "certSign.collab.signRequest.saved.defaultCanvasLabel",
              "Drawing signature",
            );
      await addSignature(
        isText
          ? {
              type: "text",
              dataUrl: createSignature,
              signerName: textValue,
              fontFamily,
              fontSize,
              textColor,
            }
          : { type: storedType, dataUrl: createSignature },
        `${baseLabel} ${index}`,
        "localStorage",
      );
    }

    beginPlacement(
      isText
        ? {
            signatureType: "text",
            signatureData: createSignature,
            signerName: textValue,
            fontFamily,
            fontSize,
            textColor,
          }
        : { signatureType: storedType, signatureData: createSignature },
    );
    setCreateOpen(false);
  }, [
    createSignature,
    createType,
    isAtCapacity,
    byTypeCounts,
    t,
    addSignature,
    beginPlacement,
    textValue,
    fontFamily,
    fontSize,
    textColor,
  ]);

  // Keyboard: Esc pauses placement, Backspace deletes the selected placement.
  useEffect(() => {
    if (!signatureConfig || createOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "CANVAS" ||
        (target as { isContentEditable?: boolean })?.isContentEditable;
      if (isTypingTarget) return;

      if (event.key === "Escape") {
        onPlacementModeChange(false);
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        onDeleteSelected?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onPlacementModeChange, onDeleteSelected, signatureConfig, createOpen]);

  if (!signatureConfig) return null;

  const previewNode =
    signatureConfig.signatureType === "text" ? (
      <Text
        size="sm"
        style={{
          fontFamily: signatureConfig.fontFamily ?? "Helvetica",
          color: signatureConfig.textColor ?? "#000000",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {(signatureConfig.signerName ?? "").trim() ||
          t("certSign.collab.signRequest.preview.textFallback", "Signature")}
      </Text>
    ) : signatureConfig.signatureData ? (
      <img
        src={signatureConfig.signatureData}
        alt={t(
          "certSign.collab.signRequest.preview.imageAlt",
          "Selected signature",
        )}
        style={{
          maxHeight: 32,
          maxWidth: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
    ) : (
      <Group gap={4} wrap="nowrap" c="var(--mantine-color-blue-6)">
        <DrawIcon sx={{ fontSize: "0.95rem" }} />
        <Text size="xs" fw={600}>
          {t("certSign.collab.signRequest.preview.create", "Add signature")}
        </Text>
      </Group>
    );

  return (
    <Stack gap="sm">
      <Text size="sm" fw={700}>
        {t("certSign.collab.signRequest.signingTitle", "Signing")}
      </Text>

      {/* Current signature + change menu */}
      <Menu withinPortal position="bottom" shadow="md" width="target">
        <Menu.Target>
          <Button
            variant="default"
            fullWidth
            justify="space-between"
            rightSection={<KeyboardArrowDownIcon sx={{ fontSize: "1.1rem" }} />}
            styles={{ label: { flex: 1, overflow: "hidden" } }}
            aria-label={t(
              "certSign.collab.signRequest.changeSignature",
              "Change signature",
            )}
          >
            <Box
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
                backgroundColor: "#ffffff",
                borderRadius: 8,
                padding: "2px 8px",
                minHeight: 28,
              }}
            >
              {previewNode}
            </Box>
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {sortedSavedSignatures.length ? (
            sortedSavedSignatures.map((sig) => (
              <Menu.Item key={sig.id} onClick={() => applySavedSignature(sig)}>
                <Group gap="sm" wrap="nowrap" justify="space-between">
                  {renderSavedSignaturePreview(sig)}
                  <ActionIcon
                    component="div"
                    size="xs"
                    color="red"
                    variant="subtle"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSignature(sig.id);
                    }}
                    aria-label={t(
                      "certSign.collab.signRequest.saved.delete",
                      "Delete signature",
                    )}
                  >
                    <CloseIcon sx={{ fontSize: "0.9rem" }} />
                  </ActionIcon>
                </Group>
              </Menu.Item>
            ))
          ) : (
            <Menu.Item disabled>
              {t(
                "certSign.collab.signRequest.saved.none",
                "No saved signatures",
              )}
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item
            leftSection={<AddIcon sx={{ fontSize: "1rem" }} />}
            onClick={openCreateModal}
            disabled={isAtCapacity}
          >
            {t(
              "certSign.collab.signRequest.createNewSignature",
              "Create New Signature",
            )}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {/* Place vs. move */}
      <SegmentedControl
        fullWidth
        value={placementMode ? "place" : "move"}
        onChange={(value) => onPlacementModeChange(value === "place")}
        data={[
          {
            value: "place",
            label: (
              <Group gap={6} wrap="nowrap" justify="center">
                <DrawIcon sx={{ fontSize: "1.1rem" }} />
                <span>
                  {t("certSign.collab.signRequest.mode.place", "Place")}
                </span>
              </Group>
            ),
          },
          {
            value: "move",
            label: (
              <Group gap={6} wrap="nowrap" justify="center">
                <OpenWithIcon sx={{ fontSize: "1.1rem" }} />
                <span>
                  {t("certSign.collab.signRequest.mode.move", "Move")}
                </span>
              </Group>
            ),
          },
        ]}
        size="xs"
        radius="xl"
        aria-label={t(
          "certSign.collab.signRequest.mode.title",
          "Sign or move mode",
        )}
      />

      <Button
        variant="light"
        color="red"
        leftSection={<DeleteOutlineIcon sx={{ fontSize: "1.1rem" }} />}
        onClick={onDeleteSelected}
        disabled={!hasSelectedAnnotation}
        fullWidth
      >
        {t(
          "certSign.collab.signRequest.deleteSelected",
          "Delete selected signature",
        )}
      </Button>

      <Button
        leftSection={<CheckIcon sx={{ fontSize: "1.1rem" }} />}
        onClick={onComplete}
        disabled={!canComplete}
        fullWidth
      >
        {t("certSign.collab.signRequest.completeAndSign", "Complete & Sign")}
      </Button>

      {/* Create signature — reuses the shared wet-signature creation flow */}
      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t(
          "certSign.collab.signRequest.createNewSignature",
          "Create New Signature",
        )}
        size="md"
        withinPortal
      >
        <SignatureCreationStep
          signatureType={createType}
          onSignatureTypeChange={setCreateType}
          signature={createSignature}
          onSignatureChange={setCreateSignature}
          signatureText={textValue}
          fontFamily={fontFamily}
          fontSize={fontSize}
          textColor={textColor}
          onSignatureTextChange={setTextValue}
          onFontFamilyChange={setFontFamily}
          onFontSizeChange={setFontSize}
          onTextColorChange={setTextColor}
          onNext={handleUseCreated}
          nextLabel={t(
            "certSign.collab.signRequest.useSignature",
            "Use signature",
          )}
        />
      </Modal>
    </Stack>
  );
}
