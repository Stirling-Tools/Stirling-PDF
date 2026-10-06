import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Menu, Modal, Text } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { Tooltip } from "@app/ui/Tooltip";
import { StatusBadge } from "@app/ui/StatusBadge";
import "@app/components/shared/signing/signingDetail.css";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
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
  signatureConfig: SignParameters | null;
  hasSelectedAnnotation?: boolean;
  onDeleteSelected?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

// wetSignature creation type ↔ stored/placement signature type.
const STORED_TYPE: Record<SignatureType, SavedSignature["type"]> = {
  draw: "canvas",
  upload: "image",
  type: "text",
};

/** Places optional visible marks in the shared viewer; certificate submission belongs to the request panel. */
export default function SignControlsPanel({
  placementMode,
  onPlacementModeChange,
  onSignatureSelected,
  signatureConfig,
  hasSelectedAnnotation = false,
  onDeleteSelected,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
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
          <span className="signing-controls__preview">
            <Text
              size="lg"
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
          </span>
        );
      }

      return (
        <span className="signing-controls__preview">
          <img
            src={sig.dataUrl}
            alt={
              sig.label ||
              t("certSign.collab.signRequest.saved.defaultLabel", "Signature")
            }
          />
        </span>
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

  useEffect(() => {
    if (!signatureConfig || createOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "CANVAS" ||
        (target as { isContentEditable?: boolean })?.isContentEditable;
      if (isTypingTarget || target?.closest('[role="dialog"]')) return;

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          event.stopPropagation();
          if (key === "y" || event.shiftKey) onRedo?.();
          else onUndo?.();
          return;
        }
      }

      if (event.key === "Escape") {
        onPlacementModeChange(false);
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        onDeleteSelected?.();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    onPlacementModeChange,
    onDeleteSelected,
    onUndo,
    onRedo,
    signatureConfig,
    createOpen,
  ]);

  if (!signatureConfig) return null;

  const previewNode =
    signatureConfig.signatureType === "text" ? (
      <Text
        size="lg"
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
      />
    ) : (
      // Sits on the white signature sheet in both schemes, so it takes a fixed
      // accent ink rather than the scheme-dependent one.
      <Group gap={4} wrap="nowrap" c="var(--c-accent-on-light)">
        <Icon name="pen-tool" size={"0.95rem"} />
        <Text size="xs" fw={600}>
          {t("certSign.collab.signRequest.preview.create", "Add signature")}
        </Text>
      </Group>
    );

  return (
    <section className="signing-detail__section">
      <div className="signing-detail__heading">
        <h3>{t("signingDetail.visibleSignature", "Visible signature")}</h3>
        <Group gap={4}>
          <StatusBadge tone="neutral" showDot={false} size="sm">
            {t("signingDetail.optional", "Optional")}
          </StatusBadge>
          <Tooltip
            content={t(
              "signMenu.optionalMarks",
              "Visible marks are optional. Complete & Sign also works with a certificate alone.",
            )}
          >
            <ActionIcon
              variant="tertiary"
              size="sm"
              aria-label={t(
                "signingDetail.visibleSignatureHelp",
                "About visible signatures",
              )}
            >
              <Icon name="info" size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>
      {!sortedSavedSignatures.length && !signatureConfig.signatureData ? (
        <Button
          variant="secondary"
          className="signing-controls__picker"
          leftSection={<Icon name="pen-tool" size={20} />}
          onClick={openCreateModal}
          fullWidth
        >
          {t("certSign.collab.signRequest.preview.create", "Add signature")}
        </Button>
      ) : (
        <Menu withinPortal position="bottom" shadow="md" width="target">
          <Menu.Target>
            <Button
              variant="secondary"
              className="signing-controls__picker"
              fullWidth
              justify="between"
              rightSection={<Icon name="chevron-down" size={"1.1rem"} />}
              aria-label={t(
                "certSign.collab.signRequest.changeSignature",
                "Change signature",
              )}
            >
              <span className="signing-controls__preview">{previewNode}</span>
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {sortedSavedSignatures.length ? (
              sortedSavedSignatures.map((sig) => (
                <Menu.Item
                  key={sig.id}
                  onClick={() => applySavedSignature(sig)}
                >
                  <Group gap="sm" wrap="nowrap" justify="space-between">
                    {renderSavedSignaturePreview(sig)}
                    <ActionIcon
                      as="div"
                      size="sm"
                      accent="danger"
                      variant="tertiary"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSignature(sig.id);
                      }}
                      aria-label={t(
                        "certSign.collab.signRequest.saved.delete",
                        "Delete signature",
                      )}
                    >
                      <Icon name="x" size={"0.9rem"} />
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
              leftSection={<Icon name="plus" size={"1rem"} />}
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
      )}
      {signatureConfig.signatureData && (
        <>
          <Group gap="xs" grow>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canUndo}
              onClick={onUndo}
              leftSection={<Icon name="undo-2" size={16} />}
            >
              {t("pageEditor.toolbar.undo", "Undo")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canRedo}
              onClick={onRedo}
              leftSection={<Icon name="redo-2" size={16} />}
            >
              {t("pageEditor.toolbar.redo", "Redo")}
            </Button>
          </Group>
          <SegmentedControl
            fullWidth
            value={placementMode ? "place" : "move"}
            onChange={(value) => onPlacementModeChange(value === "place")}
            options={[
              {
                value: "place",
                label: (
                  <Group gap={6} wrap="nowrap" justify="center">
                    <Icon name="pen-tool" size={"1.1rem"} />
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
                    <Icon name="move" size={"1.1rem"} />
                    <span>
                      {t("certSign.collab.signRequest.mode.move", "Move")}
                    </span>
                  </Group>
                ),
              },
            ]}
            size="sm"
            ariaLabel={t(
              "certSign.collab.signRequest.mode.title",
              "Sign or move mode",
            )}
          />
          {hasSelectedAnnotation && (
            <Button
              variant="tertiary"
              accent="danger"
              leftSection={<Icon name="trash" size={"1.1rem"} />}
              onClick={onDeleteSelected}
              disabled={!hasSelectedAnnotation}
              fullWidth
            >
              {t(
                "certSign.collab.signRequest.deleteSelected",
                "Delete selected signature",
              )}
            </Button>
          )}
          <p className="signing-detail__hint">
            {placementMode
              ? t(
                  "signingDetail.placeHint",
                  "Click on the document to place your signature.",
                )
              : t(
                  "signingDetail.moveHint",
                  "Select a signature on the document to move, resize or remove it.",
                )}
          </p>
        </>
      )}
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
    </section>
  );
}
