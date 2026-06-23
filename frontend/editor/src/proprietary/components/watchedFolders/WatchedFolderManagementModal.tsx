import { useState, useCallback, useRef, useEffect } from "react";
import {
  Stack,
  Group,
  TextInput,
  ColorInput,
  NumberInput,
  Text,
  Alert,
  Switch,
  Select,
  Box,
  Collapse,
  Tooltip,
  Modal,
} from "@mantine/core";
import { Button } from "@shared/components/Button";
import { useTranslation } from "react-i18next";
import { WatchedFolder } from "@app/types/watchedFolders";
import { AutomationConfig, AutomationMode } from "@app/types/automation";
import { IconPicker as IconSelector } from "@app/components/watchedFolders/IconPicker";
import AutomationCreation from "@app/components/tools/automate/AutomationCreation";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { watchedFolderStorage } from "@app/services/watchedFolderStorage";
import { folderDirectoryHandleStorage } from "@app/services/folderDirectoryHandleStorage";
import {
  canReadLocalFolder,
  canWriteLocalFolder,
  FS_WRITE_UNSUPPORTED_MSG,
} from "@app/utils/fsAccessCapability";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  Z_INDEX_AUTOMATE_MODAL,
  Z_INDEX_AUTOMATE_DROPDOWN,
} from "@app/styles/zIndex";

const ACCENT_SWATCHES = [
  "#3b82f6",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#9333ea",
  "#ec4899",
  "#6366f1",
  "#eab308",
  "#64748b",
  "#0f172a",
];

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      size="xs"
      fw={600}
      tt="uppercase"
      style={{
        letterSpacing: "0.06em",
        color: "var(--tool-subcategory-text-color)",
        marginBottom: "0.5rem",
      }}
    >
      {children}
    </Text>
  );
}

interface WatchedFolderManagementModalProps {
  opened: boolean;
  editFolder?: WatchedFolder | null;
  existingAutomation?: AutomationConfig | null;
  onClose: () => void;
  onSaved: () => void;
}

export function WatchedFolderManagementModal({
  opened,
  editFolder,
  existingAutomation,
  onClose,
  onSaved,
}: WatchedFolderManagementModalProps) {
  const { t } = useTranslation();
  const { toolRegistry } = useToolWorkflow();
  const isEditMode = !!editFolder;

  const [name, setName] = useState(editFolder?.name ?? "");
  const [icon, setIcon] = useState(editFolder?.icon ?? "FolderIcon");
  const [accentColor, setAccentColor] = useState(
    editFolder?.accentColor ?? "#3b82f6",
  );
  const [maxRetries, setMaxRetries] = useState<number>(
    editFolder?.maxRetries ?? 3,
  );
  const [retryDelayMinutes, setRetryDelayMinutes] = useState<number>(
    editFolder?.retryDelayMinutes ?? 5,
  );
  const [outputMode, setOutputMode] = useState<"new_file" | "new_version">(
    editFolder?.outputMode ?? "new_file",
  );
  const [outputName, setOutputName] = useState(
    editFolder?.outputName ?? editFolder?.name ?? "",
  );
  const [outputNamePosition, setOutputNamePosition] = useState<
    "prefix" | "suffix" | "auto-number"
  >(editFolder?.outputNamePosition ?? "prefix");
  const [inputSource, setInputSource] = useState<
    NonNullable<WatchedFolder["inputSource"]>
  >(editFolder?.inputSource ?? "idb");
  const outputNameDirty = useRef(!!editFolder?.outputName);
  const [saving, setSaving] = useState(false);
  const [outputDirName, setOutputDirName] = useState<string | null>(
    editFolder?.hasOutputDirectory ? "(loading…)" : null,
  );
  const pendingDirHandle = useRef<FileSystemDirectoryHandle | null>(null);
  const [inputDirName, setInputDirName] = useState<string | null>(
    editFolder?.inputSource === "local-folder" ? "(loading…)" : null,
  );
  const pendingInputDirHandle = useRef<FileSystemDirectoryHandle | null>(null);
  const [nameError, setNameError] = useState("");
  const [automationError, setAutomationError] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(isEditMode);

  const automationSaveTrigger = useRef<(() => void) | null>(null);

  const resetState = useCallback(() => {
    setName(editFolder?.name ?? "");
    setIcon(editFolder?.icon ?? "FolderIcon");
    setAccentColor(editFolder?.accentColor ?? "#3b82f6");
    setMaxRetries(editFolder?.maxRetries ?? 3);
    setRetryDelayMinutes(editFolder?.retryDelayMinutes ?? 5);
    setOutputMode(editFolder?.outputMode ?? "new_file");
    setOutputName(editFolder?.outputName ?? editFolder?.name ?? "");
    setOutputNamePosition(
      (editFolder?.outputNamePosition as "prefix" | "suffix" | "auto-number") ??
        "prefix",
    );
    setInputSource(editFolder?.inputSource ?? "idb");
    setInputDirName(
      editFolder?.inputSource === "local-folder" ? "(loading…)" : null,
    );
    outputNameDirty.current = !!editFolder?.outputName;
    setShowAdvanced(!!editFolder);
    setNameError("");
    setAutomationError("");
    setSaveError(null);
    setSaving(false);
  }, [editFolder]);

  useEffect(() => {
    if (opened) {
      resetState();
      pendingDirHandle.current = null;
      pendingInputDirHandle.current = null;
      if (editFolder?.hasOutputDirectory && editFolder.id) {
        folderDirectoryHandleStorage
          .get(editFolder.id)
          .then((h) => setOutputDirName(h?.name ?? null));
      } else {
        setOutputDirName(null);
      }
      if (editFolder?.inputSource === "local-folder" && editFolder.id) {
        folderDirectoryHandleStorage
          .getInput(editFolder.id)
          .then((h) => setInputDirName(h?.name ?? null));
      } else {
        setInputDirName(null);
      }
    }
  }, [opened, resetState, editFolder]);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleAutomationComplete = useCallback(
    async (automation: AutomationConfig) => {
      const trimmedName = name.trim();

      try {
        const retryFields = { maxRetries, retryDelayMinutes };
        const hasOutputDirectory = outputDirName !== null;
        const folderData = {
          name: trimmedName,
          description: "",
          icon,
          accentColor,
          automationId: automation.id,
          ...retryFields,
          outputMode:
            outputMode === "new_version" ? ("new_version" as const) : undefined,
          outputName: outputName.trim() || undefined,
          outputNamePosition:
            outputNamePosition !== "prefix" ? outputNamePosition : undefined,
          hasOutputDirectory,
          inputSource: inputSource !== "idb" ? inputSource : undefined,
        };

        if (isEditMode && editFolder) {
          const wasLocalFolder = editFolder.inputSource === "local-folder";
          await watchedFolderStorage.updateFolder({
            ...editFolder,
            ...folderData,
          });
          if (pendingDirHandle.current) {
            await folderDirectoryHandleStorage.set(
              editFolder.id,
              pendingDirHandle.current,
            );
          } else if (!hasOutputDirectory) {
            await folderDirectoryHandleStorage.remove(editFolder.id);
          }
          if (inputSource === "local-folder") {
            if (pendingInputDirHandle.current) {
              await folderDirectoryHandleStorage.setInput(
                editFolder.id,
                pendingInputDirHandle.current,
              );
            }
          } else if (wasLocalFolder) {
            await folderDirectoryHandleStorage.removeInput(editFolder.id);
          }
        } else {
          const newFolder = await watchedFolderStorage.createFolder(folderData);
          if (pendingDirHandle.current) {
            await folderDirectoryHandleStorage.set(
              newFolder.id,
              pendingDirHandle.current,
            );
          }
          if (inputSource === "local-folder" && pendingInputDirHandle.current) {
            await folderDirectoryHandleStorage.setInput(
              newFolder.id,
              pendingInputDirHandle.current,
            );
          }
        }
        resetState();
        onSaved();
        onClose();
      } catch (error) {
        console.error("Failed to save smart folder:", error);
        setSaveError(
          t(
            "watchedFolders.modal.saveFailed",
            "Failed to save folder. Please try again.",
          ),
        );
      } finally {
        setSaving(false);
      }
    },
    [
      name,
      icon,
      accentColor,
      outputMode,
      outputName,
      outputNamePosition,
      outputDirName,
      maxRetries,
      retryDelayMinutes,
      inputSource,
      isEditMode,
      editFolder,
      resetState,
      onSaved,
      onClose,
      t,
    ],
  );

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(
        t("watchedFolders.modal.nameRequired", "Folder name is required"),
      );
      return;
    }
    if (trimmedName.length > 50) {
      setNameError(
        t(
          "watchedFolders.modal.nameTooLong",
          "Folder name must be 50 characters or less",
        ),
      );
      return;
    }
    setAutomationError("");
    setSaving(true);
    automationSaveTrigger.current?.();
  };

  const title = isEditMode
    ? t("watchedFolders.modal.editTitle", "Edit Watched Folder")
    : t("watchedFolders.modal.createTitle", "New Watched Folder");

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={title}
      size="min(90rem, 94vw)"
      centered
      zIndex={Z_INDEX_AUTOMATE_MODAL}
      styles={{
        content: {
          height: "min(90vh, 60rem)",
          display: "flex",
          flexDirection: "column",
        },
        body: {
          flex: 1,
          minHeight: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      {/* Body: two-column layout */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ── Left panel: folder config ── */}
        <div
          style={{
            width: "28rem",
            flexShrink: 0,
            borderRight: "0.0625rem solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem" }}
          >
            <Stack gap="lg">
              {/* ── Identity ── */}
              <div>
                <SectionLabel>
                  {t("watchedFolders.modal.sectionFolder", "Folder")}
                </SectionLabel>
                <Stack gap="xs">
                  <Group gap="xs" align="flex-end">
                    <TextInput
                      placeholder={t(
                        "watchedFolders.modal.namePlaceholder",
                        "My Watched Folder",
                      )}
                      value={name}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        setName(val);
                        setNameError("");
                        if (!outputNameDirty.current) setOutputName(val);
                      }}
                      error={nameError}
                      withAsterisk
                      maxLength={50}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                    <IconSelector value={icon} onChange={setIcon} size="sm" />
                  </Group>

                  <ColorInput
                    label={t("watchedFolders.modal.color", "Accent colour")}
                    value={accentColor}
                    onChange={setAccentColor}
                    format="hex"
                    swatches={ACCENT_SWATCHES}
                    size="sm"
                    popoverProps={{
                      withinPortal: true,
                      zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
                    }}
                  />
                </Stack>
              </div>

              {/* ── Source & Output ── */}
              <div>
                <SectionLabel>
                  {t(
                    "watchedFolders.modal.sectionSourceOutput",
                    "Source & Output",
                  )}
                </SectionLabel>
                <Stack gap="sm">
                  <Select
                    label={t(
                      "watchedFolders.modal.inputSource",
                      "Input source",
                    )}
                    value={inputSource}
                    onChange={(v) =>
                      v &&
                      setInputSource(
                        v as NonNullable<WatchedFolder["inputSource"]>,
                      )
                    }
                    data={[
                      {
                        value: "idb",
                        label: t(
                          "watchedFolders.modal.inputSourceBrowser",
                          "Browser — drop files here",
                        ),
                      },
                      {
                        value: "local-folder",
                        label: canReadLocalFolder
                          ? t(
                              "watchedFolders.modal.inputSourceLocal",
                              "Local folder (auto-scan)",
                            )
                          : t(
                              "watchedFolders.modal.inputSourceLocalUnsupported",
                              "Local folder (auto-scan) — Chrome/Edge only",
                            ),
                        disabled: !canReadLocalFolder,
                      },
                    ]}
                    size="sm"
                    comboboxProps={{
                      withinPortal: true,
                      zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
                    }}
                  />

                  {/* Local-folder input directory picker */}
                  {inputSource === "local-folder" && (
                    <Box
                      style={{
                        marginLeft: "0.75rem",
                        paddingLeft: "0.75rem",
                        borderLeft: "2px solid var(--border-subtle)",
                      }}
                    >
                      <Box
                        style={{
                          padding: "0.5rem 0.75rem",
                          borderRadius: "var(--mantine-radius-sm)",
                          border: `0.0625rem solid ${inputDirName ? "var(--mantine-color-green-filled)" : "var(--mantine-color-yellow-5)"}`,
                          backgroundColor: inputDirName
                            ? "var(--mantine-color-green-light)"
                            : "var(--mantine-color-yellow-light)",
                        }}
                      >
                        <Group gap="xs" align="center" wrap="nowrap">
                          <FolderSpecialIcon
                            style={{
                              fontSize: "1rem",
                              color: inputDirName
                                ? "var(--color-green-500)"
                                : "var(--mantine-color-yellow-6)",
                              flexShrink: 0,
                            }}
                          />
                          <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
                            <Text size="xs" fw={500}>
                              {t(
                                "watchedFolders.modal.inputFolder",
                                "Input folder",
                              )}
                            </Text>
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {inputDirName ??
                                t(
                                  "watchedFolders.modal.inputFolderNotChosen",
                                  "No folder chosen — required for auto-scan",
                                )}
                            </Text>
                          </Stack>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                const handle = await (
                                  window as unknown as {
                                    showDirectoryPicker: (options?: {
                                      mode?: "read" | "readwrite";
                                    }) => Promise<FileSystemDirectoryHandle>;
                                  }
                                ).showDirectoryPicker({ mode: "read" });
                                pendingInputDirHandle.current = handle;
                                setInputDirName(handle.name);
                              } catch {
                                /* cancelled */
                              }
                            }}
                          >
                            {inputDirName
                              ? t("watchedFolders.modal.changeFolder", "Change")
                              : t(
                                  "watchedFolders.modal.chooseFolder",
                                  "Choose",
                                )}
                          </Button>
                          {inputDirName && (
                            <Button
                              size="sm"
                              variant="ghost"
                              accent="danger"
                              onClick={() => {
                                pendingInputDirHandle.current = null;
                                setInputDirName(null);
                              }}
                            >
                              {t("watchedFolders.modal.clearFolder", "Clear")}
                            </Button>
                          )}
                        </Group>
                      </Box>
                      <Text size="xs" c="dimmed" mt={6}>
                        {t(
                          "watchedFolders.modal.autoScanHelp",
                          "New PDF files in this folder are processed automatically every 10 seconds.",
                        )}
                      </Text>
                    </Box>
                  )}

                  {/* Local output folder */}
                  <Box
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "var(--mantine-radius-sm)",
                      border: `0.0625rem solid ${outputDirName ? "var(--mantine-color-green-filled)" : "var(--border-subtle)"}`,
                      backgroundColor: outputDirName
                        ? "var(--mantine-color-green-light)"
                        : "transparent",
                    }}
                  >
                    <Group gap="xs" align="center" wrap="nowrap">
                      <FolderSpecialIcon
                        style={{
                          fontSize: "1rem",
                          color: outputDirName
                            ? "var(--color-green-500)"
                            : "var(--mantine-color-dimmed)",
                          flexShrink: 0,
                        }}
                      />
                      <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
                        <Text size="xs" fw={500}>
                          {t(
                            "watchedFolders.modal.localOutputFolder",
                            "Local output folder",
                          )}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {!canWriteLocalFolder
                            ? t(
                                "watchedFolders.modal.outputFolderUnsupported",
                                "Not supported in this browser",
                              )
                            : (outputDirName ??
                              t(
                                "watchedFolders.modal.outputFolderNotSet",
                                "Not set — outputs stay in app",
                              ))}
                        </Text>
                      </Stack>
                      <Tooltip
                        label={FS_WRITE_UNSUPPORTED_MSG}
                        disabled={canWriteLocalFolder}
                        withinPortal
                        zIndex={Z_INDEX_AUTOMATE_DROPDOWN}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canWriteLocalFolder}
                          onClick={async () => {
                            try {
                              const handle = await (
                                window as unknown as {
                                  showDirectoryPicker: (options?: {
                                    mode?: "read" | "readwrite";
                                  }) => Promise<FileSystemDirectoryHandle>;
                                }
                              ).showDirectoryPicker({ mode: "readwrite" });
                              pendingDirHandle.current = handle;
                              setOutputDirName(handle.name);
                            } catch {
                              /* cancelled */
                            }
                          }}
                        >
                          {outputDirName
                            ? t("watchedFolders.modal.changeFolder", "Change")
                            : t("watchedFolders.modal.chooseFolder", "Choose")}
                        </Button>
                      </Tooltip>
                      {outputDirName && (
                        <Button
                          size="sm"
                          variant="ghost"
                          accent="danger"
                          onClick={() => {
                            pendingDirHandle.current = null;
                            setOutputDirName(null);
                          }}
                        >
                          {t("watchedFolders.modal.clearFolder", "Clear")}
                        </Button>
                      )}
                    </Group>
                  </Box>
                </Stack>
              </div>

              {/* ── Advanced (collapsible) ── */}
              <div>
                <Button
                  variant="ghost"
                  onClick={() => setShowAdvanced((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.25rem 0",
                    width: "100%",
                    color: "var(--tool-subcategory-text-color)",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  <ChevronRightIcon
                    sx={{
                      fontSize: "1rem",
                      transform: showAdvanced ? "rotate(90deg)" : "none",
                      transition: "transform 160ms ease",
                    }}
                  />
                  {t("watchedFolders.modal.advanced", "Advanced")}
                </Button>

                <Collapse in={showAdvanced} transitionDuration={180}>
                  <Stack gap="sm" mt="sm">
                    {/* Replace original */}
                    <Switch
                      label={t(
                        "watchedFolders.modal.replaceOriginal",
                        "Replace original file",
                      )}
                      description={
                        outputMode === "new_version"
                          ? t(
                              "watchedFolders.modal.outputModeVersionDesc",
                              "Output replaces input as a new version",
                            )
                          : t(
                              "watchedFolders.modal.outputModeNewDesc",
                              "Output saved as a separate new file",
                            )
                      }
                      checked={outputMode === "new_version"}
                      onChange={(e) =>
                        setOutputMode(
                          e.currentTarget.checked ? "new_version" : "new_file",
                        )
                      }
                      size="sm"
                    />

                    {/* Filename prefix / suffix */}
                    <Box
                      style={{
                        opacity: outputMode === "new_version" ? 0.4 : 1,
                        pointerEvents:
                          outputMode === "new_version" ? "none" : "auto",
                      }}
                    >
                      <Group gap="xs" align="flex-end">
                        {outputNamePosition === "auto-number" ? (
                          <Box style={{ flex: 1 }}>
                            <Text size="xs" fw={500} mb={4}>
                              {t(
                                "watchedFolders.modal.autoNumber",
                                "Auto-number",
                              )}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {t(
                                "watchedFolders.modal.autoNumberExample",
                                "e.g. document.pdf → document (1).pdf",
                              )}
                            </Text>
                          </Box>
                        ) : (
                          <TextInput
                            label={
                              outputNamePosition === "suffix"
                                ? t(
                                    "watchedFolders.modal.outputNameSuffix",
                                    "Filename suffix",
                                  )
                                : t(
                                    "watchedFolders.modal.outputNamePrefix",
                                    "Filename prefix",
                                  )
                            }
                            value={outputName}
                            onChange={(e) => {
                              outputNameDirty.current = true;
                              setOutputName(e.currentTarget.value);
                            }}
                            maxLength={100}
                            size="sm"
                            style={{ flex: 1 }}
                          />
                        )}
                        <Select
                          size="xs"
                          value={outputNamePosition}
                          onChange={(v) =>
                            v &&
                            setOutputNamePosition(
                              v as "prefix" | "suffix" | "auto-number",
                            )
                          }
                          data={[
                            {
                              value: "prefix",
                              label: t(
                                "watchedFolders.modal.positionPrefix",
                                "Prefix",
                              ),
                            },
                            {
                              value: "suffix",
                              label: t(
                                "watchedFolders.modal.positionSuffix",
                                "Suffix",
                              ),
                            },
                            {
                              value: "auto-number",
                              label: t(
                                "watchedFolders.modal.autoNumber",
                                "Auto-number",
                              ),
                            },
                          ]}
                          style={{ width: "8rem", flexShrink: 0 }}
                          mb={4}
                          comboboxProps={{
                            withinPortal: true,
                            zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
                          }}
                        />
                      </Group>
                    </Box>

                    {/* Retry settings */}
                    <Group gap="sm" grow>
                      <NumberInput
                        label={t(
                          "watchedFolders.modal.maxRetries",
                          "Max auto retries",
                        )}
                        value={maxRetries}
                        onChange={(v) =>
                          setMaxRetries(
                            typeof v === "number"
                              ? Math.max(0, Math.min(10, v))
                              : 0,
                          )
                        }
                        min={0}
                        max={10}
                        size="sm"
                      />
                      <NumberInput
                        label={t(
                          "watchedFolders.modal.retryDelay",
                          "Retry interval (min)",
                        )}
                        value={retryDelayMinutes}
                        onChange={(v) =>
                          setRetryDelayMinutes(
                            typeof v === "number"
                              ? Math.max(1, Math.min(60, v))
                              : 5,
                          )
                        }
                        min={1}
                        max={60}
                        size="sm"
                        disabled={maxRetries === 0}
                      />
                    </Group>
                  </Stack>
                </Collapse>
              </div>
            </Stack>
          </div>

          {/* Footer actions */}
          <div
            style={{
              padding: "1rem 1.5rem",
              borderTop: "0.0625rem solid var(--border-subtle)",
              flexShrink: 0,
            }}
          >
            {saveError && (
              <Alert
                color="red"
                variant="light"
                onClose={() => setSaveError(null)}
                withCloseButton
                mb="sm"
              >
                {saveError}
              </Alert>
            )}
            <Group justify="flex-end" gap="sm">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                {t("cancel", "Cancel")}
              </Button>
              <Button
                variant="filled"
                size="sm"
                onClick={handleSave}
                loading={saving}
                disabled={!name.trim()}
              >
                {isEditMode
                  ? t("watchedFolders.modal.saveChanges", "Save changes")
                  : t("watchedFolders.modal.createFolder", "Create folder")}
              </Button>
            </Group>
          </div>
        </div>

        {/* ── Right panel: automation steps ── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "1rem 1.5rem 0.5rem", flexShrink: 0 }}>
            <SectionLabel>
              {t("watchedFolders.modal.sectionSteps", "Steps")}
            </SectionLabel>
            {automationError && (
              <Text size="xs" c="red" mt={4}>
                {automationError}
              </Text>
            )}
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "0 1.5rem 1.5rem",
            }}
          >
            <AutomationCreation
              mode={isEditMode ? AutomationMode.EDIT : AutomationMode.CREATE}
              existingAutomation={existingAutomation ?? undefined}
              onBack={handleClose}
              onComplete={handleAutomationComplete}
              onSaveFailed={() => {
                setSaving(false);
                setAutomationError(
                  t(
                    "watchedFolders.modal.automationRequired",
                    "Add at least one configured step before saving.",
                  ),
                );
              }}
              toolRegistry={toolRegistry}
              hideMetadata
              nameOverride={
                name.trim() ||
                t(
                  "watchedFolders.modal.automationNameFallback",
                  "Watched Folder Automation",
                )
              }
              saveTriggerRef={automationSaveTrigger}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
