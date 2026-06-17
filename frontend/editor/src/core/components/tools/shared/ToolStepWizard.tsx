import React, { useEffect, useState } from "react";
import { Box, Button, Flex, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import {
  ToolWorkflowTitle,
  ToolWorkflowTitleProps,
} from "@app/components/tools/shared/ToolWorkflowTitle";
import type { TooltipTip } from "@app/types/tips";
import "@app/components/tools/shared/ToolStepWizard.css";

export interface WizardSlide {
  key: string;
  title: string;
  content: React.ReactNode;
  /** Whether the user may advance past this slide (gates Continue + forward jumps). */
  isValid: boolean;
  /** Tooltip shown on the Continue button when this slide blocks advancing. */
  blockedHint?: string;
  /**
   * Hide the bottom Continue button for this slide — used by the Files slide,
   * whose own upload CTA advances the wizard once enough files are added.
   */
  hideContinue?: boolean;
  /**
   * Invoked when the user navigates to this slide by clicking its progress-bar
   * segment in terminal (results) mode — used to reset the results so the tool
   * returns to editing this step.
   */
  onActivate?: () => void;
  tooltip?: {
    content?: React.ReactNode;
    tips?: TooltipTip[];
    header?: {
      title: string;
      logo?: React.ReactNode;
    };
  };
}

export interface ToolStepWizardProps {
  slides: WizardSlide[];
  title?: ToolWorkflowTitleProps;
  /** Primary CTA on the final slide (the execute button). */
  executeSlot?: React.ReactNode;
  /** Rendered just beneath the execute button on the final slide. */
  belowExecuteButton?: React.ReactNode;
  /** Optional preview content shown on the final slide above the CTA. */
  preview?: React.ReactNode;
  /**
   * Terminal (results) mode: the flow is complete, so the wizard sits on the
   * last slide with the whole progress bar filled and no Continue/Back CTAs (the
   * review content carries its own undo/download). Clicking an earlier bar
   * segment fires that slide's onActivate (reset) to return to editing it.
   */
  terminal?: boolean;
}

/**
 * Renders a tool's steps as a slide wizard: a segmented progress bar at the top,
 * one step per slide with centered content, and large Back / Continue CTAs at
 * the bottom. The final slide swaps Continue for the tool's execute button. A
 * single-step flow drops the progress bar / step counter / title and just shows
 * the centered content and its primary action.
 *
 * Navigation is gated: Continue and forward jumps are blocked until the current
 * slide is valid; Back (and clicking an earlier segment) is always allowed.
 */
export function ToolStepWizard({
  slides,
  title,
  executeSlot,
  belowExecuteButton,
  preview,
  terminal = false,
}: ToolStepWizardProps) {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState<string>(() => slides[0]?.key);

  // Keep activeKey valid as the slide set changes (e.g. the Files slide drops
  // out once a file is selected). Falls back to the first slide.
  useEffect(() => {
    if (slides.length > 0 && !slides.some((s) => s.key === activeKey)) {
      setActiveKey(slides[0].key);
    }
  }, [slides, activeKey]);

  if (slides.length === 0) return null;

  // In terminal (results) mode the flow is complete: lock onto the last slide.
  const rawIndex = slides.findIndex((s) => s.key === activeKey);
  const currentIndex = terminal
    ? slides.length - 1
    : rawIndex < 0
      ? 0
      : rawIndex;
  const current = slides[currentIndex];
  const isLast = currentIndex === slides.length - 1;
  const canAdvance = current.isValid;
  const showBack = !terminal && currentIndex > 0;
  // A single-step flow is just centered content + its action — no progress bar,
  // step counter, or title (a lone full-width segment reads as an odd solid
  // line). The chrome appears only with 2+ steps.
  const showChrome = slides.length > 1;
  const showContinue = !isLast && !current.hideContinue;
  const hasCta = isLast
    ? Boolean(executeSlot) || Boolean(belowExecuteButton)
    : showContinue || showBack;

  // Forward jumps require every intervening slide to be valid; back is free.
  // In terminal (results) mode every earlier step is reachable to go back and edit.
  const canJumpTo = (target: number) => {
    if (terminal) return target < currentIndex;
    if (target === currentIndex) return false;
    if (target < currentIndex) return true;
    for (let i = currentIndex; i < target; i++) {
      if (!slides[i].isValid) return false;
    }
    return true;
  };

  const goTo = (target: number) => {
    if (target < 0 || target >= slides.length) return;
    // In terminal mode, navigating back resets the results (returns to editing).
    if (terminal) slides[target].onActivate?.();
    setActiveKey(slides[target].key);
  };

  return (
    <div className="tool-step-wizard">
      {title && (
        <div className="tool-step-wizard__title">
          <ToolWorkflowTitle {...title} />
        </div>
      )}

      {showChrome && (
        <div
          className="tool-step-wizard__progress"
          role="tablist"
          aria-label={t("wizardProgress", "Step progress")}
        >
          {slides.map((slide, index) => {
            const filled = index <= currentIndex;
            const isCurrent = index === currentIndex;
            const jumpable = canJumpTo(index);
            return (
              <button
                key={slide.key}
                type="button"
                className="tool-step-wizard__segment"
                data-filled={filled || undefined}
                data-current={isCurrent || undefined}
                data-jumpable={jumpable || undefined}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${t(
                  "wizardStepProgress",
                  "Step {{current}} of {{total}}",
                  {
                    current: index + 1,
                    total: slides.length,
                  },
                )}: ${slide.title}`}
                disabled={!jumpable && !isCurrent}
                onClick={() => jumpable && goTo(index)}
              >
                <span className="tool-step-wizard__segment-fill" />
              </button>
            );
          })}
        </div>
      )}

      {showChrome && (
        <Text
          className="tool-step-wizard__caption"
          size="xs"
          c="dimmed"
          ta="center"
        >
          {t("wizardStepProgress", "Step {{current}} of {{total}}", {
            current: currentIndex + 1,
            total: slides.length,
          })}
        </Text>
      )}

      <div className="tool-step-wizard__body">
        <div className="tool-step-wizard__slide" key={current.key}>
          {showChrome &&
            (current.tooltip ? (
              <Tooltip
                content={current.tooltip.content}
                tips={current.tooltip.tips}
                header={current.tooltip.header}
                sidebarTooltip={true}
                pinOnClick={true}
              >
                <Flex align="center" justify="center" gap="xs">
                  <Text fw={600} size="md">
                    {current.title}
                  </Text>
                  <LocalIcon
                    icon="info-outline-rounded"
                    width="1.25rem"
                    height="1.25rem"
                    style={{ color: "var(--icon-files-color)" }}
                  />
                </Flex>
              </Tooltip>
            ) : (
              <Text fw={600} size="md" ta="center">
                {current.title}
              </Text>
            ))}

          <div className="tool-step-wizard__slide-content">
            {current.content}
          </div>

          {isLast && preview && <div>{preview}</div>}
        </div>

        {hasCta && (
          <div className="tool-step-wizard__cta">
            {isLast ? (
              (executeSlot ?? null)
            ) : showContinue ? (
              !canAdvance && current.blockedHint ? (
                <Tooltip content={current.blockedHint} position="top" arrow>
                  <Box mx="md" mt="md">
                    <Button
                      fullWidth
                      disabled
                      size="md"
                      color="blue"
                      className="tool-step-wizard__cta-btn"
                      data-testid="wizard-continue"
                    >
                      {t("wizardContinue", "Continue")}
                    </Button>
                  </Box>
                </Tooltip>
              ) : (
                <Button
                  mx="md"
                  mt="md"
                  size="md"
                  color="blue"
                  disabled={!canAdvance}
                  onClick={() => canAdvance && goTo(currentIndex + 1)}
                  className="tool-step-wizard__cta-btn"
                  data-testid="wizard-continue"
                >
                  {t("wizardContinue", "Continue")}
                </Button>
              )
            ) : null}
            {isLast && belowExecuteButton}
            {showBack && (
              <Button
                mx="md"
                mt="sm"
                size="md"
                variant="default"
                onClick={() => goTo(currentIndex - 1)}
                className="tool-step-wizard__cta-btn"
                data-testid="wizard-back"
              >
                {t("back", "Back")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ToolStepWizard;
