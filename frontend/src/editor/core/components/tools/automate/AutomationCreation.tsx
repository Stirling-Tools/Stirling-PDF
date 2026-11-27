import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Text,
  Stack,
  Group,
  TextInput,
  Textarea,
  Modal,
  Menu,
} from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Z_INDEX_AUTOMATE_MODAL } from "@editor/styles/zIndex";
import { Icon } from "@editor/ui/Icon";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import type { ToolId } from "@editor/types/toolId";
import ToolList from "@editor/components/tools/automate/ToolList";
import IconSelector from "@editor/components/tools/automate/IconSelector";
import AutomatePanelHeader from "@editor/components/tools/automate/AutomatePanelHeader";
import { AutomationConfig, AutomationMode } from "@editor/types/automation";
import {
  useAutomationForm,
  type SaveBlocker,
} from "@editor/hooks/tools/automate/useAutomationForm";
import {
  downloadAutomationConfig,
  downloadFolderScanningConfig,
} from "@editor/utils/automationConverter";
import classes from "@editor/components/tools/automate/Automate.module.css";

interface AutomationCreationProps {
  mode: AutomationMode;
  existingAutomation?: AutomationConfig;
  /** Leaves the builder without saving; called only once unsaved changes are confirmed lost. */
  onBack: () => void;
  /** Names where the back arrow goes, when that is not the library. */
  backLabel?: string;
  onComplete: (automation: AutomationConfig) => void;
  toolRegistry: Partial<ToolRegistry>;
  /** Opens this step's settings on arrival, e.g. from a failed run's "Edit step". */
  focusStepIndex?: number;
}

export default function AutomationCreation({
  mode,
  existingAutomation,
  onBack,
  backLabel,
  onComplete,
  toolRegistry,
  focusStepIndex,
}: AutomationCreationProps) {
  const { t } = useTranslation();

  const form = useAutomationForm({ mode, existingAutomation, toolRegistry });
  const { steps, saveBlocker } = form;
  const saveBlockerId = useId();

  const [focusStepId] = useState<string | null>(() =>
    focusStepIndex !== undefined ? (steps[focusStepIndex]?.id ?? null) : null,
  );
  const [expandedStepId, setExpandedStepId] = useState<string | null>(
    focusStepId,
  );
  const [pickerStepId, setPickerStepId] = useState<string | null>(null);
  const [unsavedWarningOpen, setUnsavedWarningOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const requestLeave = () => {
    if (form.isDirty) {
      setUnsavedWarningOpen(true);
    } else {
      onBack();
    }
  };

  const toggleSettings = (stepId: string) =>
    setExpandedStepId((current) => (current === stepId ? null : stepId));

  const handleAddStep = () => {
    setPickerStepId(form.addStep());
    setExpandedStepId(null);
  };

  const handleSelectTool = (index: number, operation: string) => {
    form.setStepTool(index, operation);
    const hasSettings = Boolean(
      toolRegistry[operation as ToolId]?.automationSettings,
    );
    setExpandedStepId(hasSettings ? steps[index].id : null);
  };

  const saveAutomation = async () => {
    if (saveBlocker) return;
    const automationData = form.buildAutomationData();
    setSaving(true);
    setSaveError(null);
    try {
      const { automationStorage } =
        await import("@editor/services/automationStorage");
      const saved =
        mode === AutomationMode.EDIT && existingAutomation
          ? await automationStorage.updateAutomation({
              ...existingAutomation,
              ...automationData,
            })
          : await automationStorage.saveAutomation(automationData);
      onComplete(saved);
    } catch (error) {
      console.error("Error saving automation:", error);
      setSaveError(
        t("automate.creation.saveFailed", "Couldn't save this automation."),
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * A temporary AutomationConfig from in-progress form state, so export works
   * without saving first. The export utilities strip `id` and the timestamps.
   */
  const buildExportableAutomation = (): AutomationConfig => ({
    id: existingAutomation?.id || "temp",
    ...form.buildAutomationData(),
    createdAt: existingAutomation?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const blockerText = (blocker: SaveBlocker): string => {
    switch (blocker.kind) {
      case "name":
        return t(
          "automate.creation.blocker.name",
          "Name the automation to save it.",
        );
      case "noSteps":
        return t("automate.creation.blocker.noSteps", "Add a step to save.");
      case "stepNoTool":
        return t(
          "automate.creation.blocker.stepNoTool",
          "Choose a tool for step {{n}}, or remove it.",
          { n: blocker.index + 1 },
        );
      case "stepNeedsConfiguration":
        return t(
          "automate.creation.blocker.stepNeedsConfiguration",
          "Step {{n}} needs configuration before you can save.",
          {
            n: blocker.index + 1,
          },
        );
    }
  };

  const title =
    mode === AutomationMode.EDIT
      ? t("automate.creation.editTitle", "Edit automation")
      : t("automate.creation.createTitle", "New automation");

  return (
    <>
      <AutomatePanelHeader
        title={title}
        onBack={saving ? undefined : requestLeave}
        backLabel={backLabel}
        actions={
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                variant="tertiary"
                accent="neutral"
                size="sm"
                disabled={saveBlocker !== null}
                rightSection={<Icon name="chevron-down" size={14} />}
              >
                {t("automate.creation.export", "Export")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="download" size={16} />}
                onClick={() =>
                  downloadAutomationConfig(buildExportableAutomation())
                }
              >
                {t("automate.creation.exportAutomate", "Automate JSON")}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="download" size={16} />}
                onClick={() =>
                  downloadFolderScanningConfig(
                    buildExportableAutomation(),
                    toolRegistry,
                  )
                }
              >
                {t(
                  "automate.creation.exportFolderScanning",
                  "Folder Scanning JSON",
                )}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        }
      />

      <div className={classes.nameRow}>
        <IconSelector
          value={form.automationIcon || "SettingsIcon"}
          onChange={form.setAutomationIcon}
          size="md"
        />
        <TextInput
          label={t("automate.creation.name.label", "Name")}
          placeholder={t("automate.creation.name.placeholder", "My automation")}
          value={form.automationName}
          withAsterisk
          onChange={(e) => form.setAutomationName(e.currentTarget.value)}
          size="sm"
          style={{ flex: 1 }}
        />
      </div>

      <Textarea
        label={t(
          "automate.creation.description.label",
          "Description (optional)",
        )}
        placeholder={t(
          "automate.creation.description.placeholder",
          "What does this automation do?",
        )}
        value={form.automationDescription}
        onChange={(e) => form.setAutomationDescription(e.currentTarget.value)}
        size="sm"
        autosize
        minRows={2}
        maxRows={5}
      />

      <ToolList
        initialFocusStepId={focusStepId}
        steps={steps}
        toolRegistry={toolRegistry}
        expandedStepId={expandedStepId}
        pickerStepId={pickerStepId}
        isStepReady={form.stepReady}
        onToggleSettings={toggleSettings}
        onConfirmSettings={form.markStepConfigured}
        onSelectTool={handleSelectTool}
        onParameterChange={form.setStepParameter}
        onChangeTool={(index) => {
          form.clearStepTool(index);
          setPickerStepId(steps[index].id);
        }}
        onRemove={form.removeStep}
        onMove={form.moveStep}
        onAdd={handleAddStep}
      />

      <div className={classes.footer}>
        {/* What blocks Save now outranks an earlier failed save. */}
        {saveError && !saveBlocker ? (
          <Text size="xs" role="alert" c="var(--c-danger)">
            {saveError}
          </Text>
        ) : (
          saveBlocker && (
            <p
              id={saveBlockerId}
              className={classes.hint}
              data-testid="automation-save-blocker"
            >
              {saveBlocker.kind === "stepNeedsConfiguration" ? (
                <button
                  type="button"
                  className={classes.inlineLink}
                  onClick={() => setExpandedStepId(steps[saveBlocker.index].id)}
                >
                  {blockerText(saveBlocker)}
                </button>
              ) : (
                blockerText(saveBlocker)
              )}
            </p>
          )
        )}
        <div className={classes.footerButtons}>
          <Button
            variant="secondary"
            accent="neutral"
            onClick={requestLeave}
            disabled={saving}
          >
            {t("automate.creation.cancel", "Cancel")}
          </Button>
          <Button
            onClick={saveAutomation}
            disabled={saveBlocker !== null}
            aria-describedby={saveBlocker ? saveBlockerId : undefined}
            loading={saving}
          >
            {t("automate.creation.save", "Save")}
          </Button>
        </div>
      </div>

      <Modal
        opened={unsavedWarningOpen}
        onClose={() => setUnsavedWarningOpen(false)}
        title={t("automate.creation.unsavedChanges.title", "Discard changes?")}
        centered
        zIndex={Z_INDEX_AUTOMATE_MODAL}
      >
        <Stack gap="md">
          <Text size="sm">
            {t(
              "automate.creation.unsavedChanges.message",
              "Your changes to this automation haven't been saved.",
            )}
          </Text>
          <Group gap="sm" justify="flex-end">
            <Button
              variant="secondary"
              onClick={() => setUnsavedWarningOpen(false)}
            >
              {t("automate.creation.unsavedChanges.cancel", "Keep editing")}
            </Button>
            <Button
              accent="danger"
              onClick={() => {
                setUnsavedWarningOpen(false);
                onBack();
              }}
            >
              {t("automate.creation.unsavedChanges.confirm", "Discard")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
