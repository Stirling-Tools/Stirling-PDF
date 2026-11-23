import { useContext, useRef } from "react";
import { Stack, Text, Group, Select, NumberInput, Input } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { FilePicker } from "@editor/ui/FilePicker";
import { ActionIcon } from "@editor/ui/ActionIcon";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
import { useTranslation } from "react-i18next";
import {
  type OverlayPdfsParameters,
  type OverlayMode,
} from "@editor/hooks/tools/overlayPdfs/useOverlayPdfsParameters";
import { Icon } from "@editor/ui/Icon";
import { FilesModalContext } from "@editor/contexts/FilesModalContext";
import styles from "@editor/components/tools/overlayPdfs/OverlayPdfsSettings.module.css";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

interface OverlayPdfsSettingsProps {
  parameters: OverlayPdfsParameters;
  onParameterChange: <K extends keyof OverlayPdfsParameters>(
    key: K,
    value: OverlayPdfsParameters[K],
  ) => void;
  disabled?: boolean;
}

export default function OverlayPdfsSettings({
  parameters,
  onParameterChange,
  disabled = false,
}: OverlayPdfsSettingsProps) {
  const { t } = useTranslation();
  // Read optionally: the portal pipeline builder mounts no FilesModalProvider.
  // Present (editor tool + Automate modal) -> keep the workspace file picker;
  // absent (portal) -> fall back to the plain file input below.
  const filesModal = useContext(FilesModalContext);
  // Clears the FilePicker so the same file can be re-selected (Mantine resetRef).
  const resetOverlayPicker = useRef<() => void>(null);

  const handleOverlayFilesChange = (files: File[]) => {
    onParameterChange("overlayFiles", files);
    // Reset counts to match number of files if in FixedRepeatOverlay
    if (parameters.overlayMode === "FixedRepeatOverlay") {
      const nextCounts = files.map((_, i) =>
        parameters.counts[i] && parameters.counts[i] > 0
          ? parameters.counts[i]
          : 1,
      );
      onParameterChange("counts", nextCounts);
    }
  };

  const handleModeChange = (mode: OverlayMode) => {
    onParameterChange("overlayMode", mode);
    if (mode !== "FixedRepeatOverlay") {
      onParameterChange("counts", []);
    } else if (parameters.overlayFiles?.length > 0) {
      onParameterChange(
        "counts",
        parameters.overlayFiles.map((_, i) =>
          parameters.counts[i] && parameters.counts[i] > 0
            ? parameters.counts[i]
            : 1,
        ),
      );
    }
  };

  const handleOpenOverlayFilesModal = () => {
    if (disabled || !filesModal) return;
    filesModal.openFilesModal({
      customHandler: (files: File[]) => {
        handleOverlayFilesChange([
          ...(parameters.overlayFiles || []),
          ...files,
        ]);
      },
    });
  };

  const appendOverlayFiles = (files: File[]) => {
    if (files.length === 0) return;
    handleOverlayFilesChange([...(parameters.overlayFiles || []), ...files]);
    resetOverlayPicker.current?.();
  };

  const overlayFilesButtonLabel =
    parameters.overlayFiles?.length > 0
      ? t("overlay-pdfs.overlayFiles.addMore", "Add more PDFs...")
      : t("overlay-pdfs.overlayFiles.placeholder", "Choose PDF(s)...");

  return (
    <Stack gap="md">
      <Select
        {...infoLabelProps(
          t("overlay-pdfs.mode.label", "Overlay Mode"),
          t(
            "overlay-pdfs.tooltip.mode.text",
            "Choose how to distribute overlay pages across the base PDF pages.",
          ),
        )}
        data={[
          {
            value: "SequentialOverlay",
            label: t("overlay-pdfs.mode.sequential", "Sequential Overlay"),
          },
          {
            value: "InterleavedOverlay",
            label: t("overlay-pdfs.mode.interleaved", "Interleaved Overlay"),
          },
          {
            value: "FixedRepeatOverlay",
            label: t("overlay-pdfs.mode.fixedRepeat", "Fixed Repeat Overlay"),
          },
        ]}
        value={parameters.overlayMode}
        onChange={(v) =>
          handleModeChange((v || "SequentialOverlay") as OverlayMode)
        }
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />

      <ButtonSelector
        {...infoLabelProps(
          t("overlay-pdfs.position.label", "Overlay Position"),
          t(
            "overlay-pdfs.tooltip.position.text",
            "Foreground places the overlay on top of the page. Background places it behind.",
          ),
        )}
        value={parameters.overlayPosition}
        onChange={(v) => onParameterChange("overlayPosition", v)}
        disabled={disabled}
        options={[
          {
            label: t("overlay-pdfs.position.foreground", "Foreground"),
            value: 0,
          },
          {
            label: t("overlay-pdfs.position.background", "Background"),
            value: 1,
          },
        ]}
      />

      {parameters.overlayMode === "FixedRepeatOverlay" && (
        <Input.Wrapper
          {...infoLabelProps(
            t("overlay-pdfs.counts.label", "Overlay Counts"),
            t(
              "overlay-pdfs.tooltip.counts.text",
              "Provide a positive number for each overlay file showing how many pages to take before moving to the next. Required when mode is Fixed Repeat.",
            ),
          )}
        >
          {parameters.overlayFiles?.length > 0 ? (
            <Stack gap="xs">
              {parameters.overlayFiles.map((_, index) => {
                const countLabel = `${t("overlay-pdfs.counts.item", "Count for file")} ${index + 1}`;
                return (
                  <Group key={index} gap="xs" wrap="nowrap">
                    <Text size="sm" className={styles.countLabel} aria-hidden>
                      {countLabel}
                    </Text>
                    <NumberInput
                      aria-label={countLabel}
                      min={1}
                      step={1}
                      value={parameters.counts[index] ?? 1}
                      onChange={(value) => {
                        const next = [...(parameters.counts || [])];
                        next[index] = Number(value) || 1;
                        onParameterChange("counts", next);
                      }}
                      disabled={disabled}
                    />
                  </Group>
                );
              })}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              {t(
                "overlay-pdfs.counts.noFiles",
                "Add overlay files to configure counts",
              )}
            </Text>
          )}
        </Input.Wrapper>
      )}

      <Input.Wrapper
        {...infoLabelProps(
          t("overlay-pdfs.overlayFiles.label", "Overlay Files"),
          t(
            "overlay-pdfs.tooltip.overlayFiles.text",
            "Select one or more PDFs to overlay on the base. The order of these files affects how pages are applied in Sequential and Fixed Repeat modes.",
          ),
        )}
      >
        <Stack gap="xs">
          {filesModal ? (
            <Button
              variant="secondary"
              onClick={handleOpenOverlayFilesModal}
              disabled={disabled}
              leftSection={<Icon name="plus" size="14" />}
              fullWidth
            >
              {overlayFilesButtonLabel}
            </Button>
          ) : (
            <FilePicker
              multiple
              accept="application/pdf"
              onChange={appendOverlayFiles}
              resetRef={resetOverlayPicker}
              variant="secondary"
              disabled={disabled}
              leftSection={<Icon name="plus" size="14" />}
              fullWidth
            >
              {overlayFilesButtonLabel}
            </FilePicker>
          )}

          {parameters.overlayFiles?.length > 0 && (
            <div className={styles.fileListContainer}>
              <Stack gap="xs">
                {parameters.overlayFiles.map((file, index) => (
                  <Group
                    key={index}
                    justify="space-between"
                    p="xs"
                    className={styles.fileItem}
                  >
                    <Group gap="xs" className={styles.fileGroup}>
                      <div className={styles.fileNameContainer}>
                        <div
                          className={`${styles.fileName} ${privateContentClassName}`}
                          title={file.name}
                        >
                          {file.name}
                        </div>
                      </div>
                      <Text size="xs" c="dimmed" className={styles.fileSize}>
                        ({(file.size / 1024).toFixed(1)} KB)
                      </Text>
                    </Group>
                    <ActionIcon
                      size="sm"
                      variant="tertiary"
                      accent="danger"
                      className={styles.removeButton}
                      onClick={() => {
                        const next = (parameters.overlayFiles || []).filter(
                          (_, i) => i !== index,
                        );
                        handleOverlayFilesChange(next);
                      }}
                      disabled={disabled}
                      aria-label={t("remove", "Remove")}
                    >
                      <Icon name="x" size="14" />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            </div>
          )}
        </Stack>
      </Input.Wrapper>
    </Stack>
  );
}
