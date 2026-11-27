import { Fragment, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader, Menu } from "@mantine/core";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { AutomationTool } from "@editor/types/automation";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { ToolId } from "@editor/types/toolId";
import ToolSelector from "@editor/components/tools/automate/ToolSelector";
import AutomationStepCard, {
  StepConnector,
} from "@editor/components/tools/automate/AutomationStepCard";
import {
  defaultParametersFor,
  toolDisplayName,
} from "@editor/components/tools/automate/stepSummary";
import classes from "@editor/components/tools/automate/Automate.module.css";

function scrollIntoViewOnMount(element: HTMLElement | null) {
  element?.scrollIntoView?.({ block: "nearest" });
}

interface ToolListProps {
  steps: AutomationTool[];
  toolRegistry: Partial<ToolRegistry>;
  /** The one step whose settings are open, or null. */
  expandedStepId: string | null;
  /** A step just added: its picker opens straight away. */
  pickerStepId?: string | null;
  /** A step to put focus on when the list first renders, e.g. the step a failed run's "Edit step" opened. */
  initialFocusStepId?: string | null;
  isStepReady: (step: AutomationTool) => boolean;
  onToggleSettings: (stepId: string) => void;
  /** The step's Done button: the user has reviewed its settings. */
  onConfirmSettings: (stepId: string) => void;
  onSelectTool: (index: number, operation: string) => void;
  onParameterChange: (index: number, key: string, value: unknown) => void;
  onChangeTool: (index: number) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onAdd: () => void;
}

/** The builder's step list: numbered cards, settings inline, actions per step. */
export default function ToolList({
  steps,
  toolRegistry,
  expandedStepId,
  pickerStepId = null,
  initialFocusStepId = null,
  isStepReady,
  onToggleSettings,
  onConfirmSettings,
  onSelectTool,
  onParameterChange,
  onChangeTool,
  onRemove,
  onMove,
  onAdd,
}: ToolListProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  // A move can disable the control that had focus (Move up on what is now step
  // 1), and picking a tool unmounts the picker that had it; either would drop
  // focus to the page and hide the hover-only arrows. Focus goes to the named
  // control on that step instead, or its first enabled one; with no step to
  // land on (the last one was removed), Add step.
  const [focusRequest, setFocusRequest] = useState<{
    stepId: string | null;
    label: string;
  } | null>(() =>
    initialFocusStepId
      ? {
          stepId: initialFocusStepId,
          label: t("automate.steps.settings", "Step settings"),
        }
      : null,
  );
  const addStepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!focusRequest) return;
    setFocusRequest(null);
    const card = focusRequest.stepId
      ? listRef.current?.querySelector<HTMLElement>(
          `[data-step-id="${focusRequest.stepId}"]`,
        )
      : null;
    if (!card) {
      addStepRef.current?.focus();
      return;
    }
    // The move arrows are hidden until the card has hover or focus, and a hidden
    // button cannot take focus; reveal them while focus is placed.
    card.setAttribute("data-revealing", "");
    const target = [
      card.querySelector<HTMLButtonElement>(
        `button[aria-label="${CSS.escape(focusRequest.label)}"]`,
      ),
      ...Array.from(card.querySelectorAll<HTMLButtonElement>("button")),
    ].find(
      (button) =>
        button && !button.disabled && button.getClientRects().length > 0,
    );
    target?.focus();
    target?.scrollIntoView?.({ block: "nearest" });
    card.removeAttribute("data-revealing");
  }, [focusRequest, steps]);

  const settingsLabel = t("automate.steps.settings", "Step settings");

  const menuLabelAt = (index: number) =>
    t("automate.steps.menu", "More for step {{n}}", { n: index + 1 });

  const move = (index: number, delta: -1 | 1, label: string) => {
    setFocusRequest({ stepId: steps[index].id, label });
    onMove(index, delta);
  };

  const remove = (index: number) => {
    const next = steps[index + 1];
    const previous = steps[index - 1];
    setFocusRequest(
      next
        ? { stepId: next.id, label: menuLabelAt(index) }
        : previous
          ? { stepId: previous.id, label: menuLabelAt(index - 1) }
          : { stepId: null, label: "" },
    );
    onRemove(index);
  };

  const confirmSettings = (stepId: string) => {
    onConfirmSettings(stepId);
    setFocusRequest({ stepId, label: settingsLabel });
    onToggleSettings(stepId);
  };

  const renderStep = (step: AutomationTool, index: number) => {
    if (!step.operation) {
      return (
        <AutomationStepCard
          index={index}
          stepId={step.id}
          title={
            <span style={{ color: "var(--c-text-muted)", fontWeight: 400 }}>
              {t("automate.steps.chooseTool", "Choose a tool")}
            </span>
          }
          actions={
            <ActionIcon
              variant="tertiary"
              accent="neutral"
              size="sm"
              onClick={() => remove(index)}
              aria-label={t("automate.steps.remove", "Remove step")}
              title={t("automate.steps.remove", "Remove step")}
            >
              <Icon name="x" size={16} />
            </ActionIcon>
          }
        >
          <div
            className={classes.stepPicker}
            ref={step.id === pickerStepId ? scrollIntoViewOnMount : undefined}
          >
            <ToolSelector
              onSelect={(operation) => {
                setFocusRequest({ stepId: step.id, label: settingsLabel });
                onSelectTool(index, operation);
              }}
              excludeTools={["automate"]}
              toolRegistry={toolRegistry}
              placeholder={t("automate.steps.searchTools", "Search tools…")}
              defaultOpen={step.id === pickerStepId}
            />
          </div>
        </AutomationStepCard>
      );
    }

    const entry = toolRegistry[step.operation as ToolId];
    const SettingsComponent = entry?.automationSettings;
    const expanded = expandedStepId === step.id && Boolean(SettingsComponent);
    const ready = isStepReady(step);
    const moveUpLabel = t("automate.steps.moveUp", "Move up");
    const moveDownLabel = t("automate.steps.moveDown", "Move down");
    const menuLabel = menuLabelAt(index);

    const meta = ready ? (
      t("automate.steps.configured", "Configured")
    ) : (
      <span className={classes.needsConfiguration}>
        {t("automate.steps.needsConfiguration", "Needs configuration")}
      </span>
    );

    return (
      <AutomationStepCard
        index={index}
        stepId={step.id}
        title={toolDisplayName(t, toolRegistry, step.operation)}
        meta={meta}
        expanded={expanded}
        needsSettings={!ready}
        onHeadClick={
          SettingsComponent ? () => onToggleSettings(step.id) : undefined
        }
        actions={
          <>
            {steps.length > 1 && (
              <>
                <ActionIcon
                  variant="tertiary"
                  accent="neutral"
                  size="sm"
                  className={classes.stepMove}
                  disabled={index === 0}
                  onClick={() => move(index, -1, moveUpLabel)}
                  aria-label={moveUpLabel}
                  title={moveUpLabel}
                >
                  <Icon name="arrow-up" size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="tertiary"
                  accent="neutral"
                  size="sm"
                  className={classes.stepMove}
                  disabled={index === steps.length - 1}
                  onClick={() => move(index, 1, moveDownLabel)}
                  aria-label={moveDownLabel}
                  title={moveDownLabel}
                >
                  <Icon name="arrow-down" size={16} />
                </ActionIcon>
              </>
            )}
            {SettingsComponent && (
              <ActionIcon
                variant="tertiary"
                accent="neutral"
                size="sm"
                onClick={() => onToggleSettings(step.id)}
                aria-label={settingsLabel}
                aria-expanded={expanded}
                title={settingsLabel}
              >
                <Icon name="sliders-horizontal" size={16} />
              </ActionIcon>
            )}
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon
                  variant="tertiary"
                  accent="neutral"
                  size="sm"
                  aria-label={menuLabel}
                >
                  <Icon name="ellipsis-vertical" size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Icon name="arrow-up" size={16} />}
                  disabled={index === 0}
                  onClick={() => move(index, -1, menuLabelAt(index - 1))}
                >
                  {t("automate.steps.moveUp", "Move up")}
                </Menu.Item>
                <Menu.Item
                  leftSection={<Icon name="arrow-down" size={16} />}
                  disabled={index === steps.length - 1}
                  onClick={() => move(index, 1, menuLabelAt(index + 1))}
                >
                  {t("automate.steps.moveDown", "Move down")}
                </Menu.Item>
                <Menu.Item
                  leftSection={<Icon name="replace" size={16} />}
                  onClick={() => onChangeTool(index)}
                >
                  {t("automate.steps.changeTool", "Change tool")}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<Icon name="trash" size={16} />}
                  style={{ color: "var(--c-danger)" }}
                  onClick={() => remove(index)}
                >
                  {t("automate.steps.remove", "Remove step")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        }
      >
        {expanded && SettingsComponent && (
          <div className={classes.stepSettings}>
            <Suspense fallback={<Loader size="sm" />}>
              <SettingsComponent
                parameters={{
                  ...defaultParametersFor(toolRegistry, step.operation),
                  ...(step.parameters ?? {}),
                }}
                onParameterChange={(key, value) =>
                  onParameterChange(index, String(key), value)
                }
                disabled={false}
              />
            </Suspense>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => confirmSettings(step.id)}
              style={{ alignSelf: "flex-end" }}
            >
              {t("automate.steps.done", "Done")}
            </Button>
          </div>
        )}
      </AutomationStepCard>
    );
  };

  return (
    <div className={classes.section}>
      <span className={classes.fieldLabel}>
        {t("automate.steps.label", "Steps")}
      </span>
      <div
        className={classes.stepList}
        style={{ marginTop: "0.375rem" }}
        ref={listRef}
      >
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            {index > 0 && <StepConnector />}
            {renderStep(step, index)}
          </Fragment>
        ))}
      </div>
      <button
        type="button"
        className={classes.addStep}
        onClick={onAdd}
        ref={addStepRef}
      >
        <Icon name="plus" size={16} />
        {t("automate.steps.add", "Add step")}
      </button>
    </div>
  );
}
