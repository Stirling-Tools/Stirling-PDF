/**
 * OnboardingTour Component
 *
 * Reusable tour wrapper that encapsulates all Reactour configuration.
 * Used by the main Onboarding component for both the 'tour' step and
 * when the tour is open but onboarding is inactive.
 */

import React, { type ReactNode } from "react";
import { TourProvider, useTour, type StepType } from "@reactour/tour";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import type { TFunction } from "i18next";
import i18n from "@editor/i18n";

/**
 * Renders tour copy that uses <strong> for emphasis as real React elements,
 * so there is no raw-HTML injection surface (avoids dangerouslySetInnerHTML).
 * Any other markup is shown as plain text.
 */
export function renderTourContent(content: string): ReactNode {
  return content.split(/(<strong>.*?<\/strong>)/g).map((part, index) => {
    const match = part.match(/^<strong>(.*?)<\/strong>$/);
    if (match) return <strong key={index}>{match[1]}</strong>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

/**
 * TourContent - Controls the tour visibility
 * Syncs the forceOpen prop with the reactour tour state.
 */
function TourContent({ forceOpen = false }: { forceOpen?: boolean }) {
  const { setIsOpen, setCurrentStep } = useTour();
  const previousIsOpenRef = React.useRef(forceOpen);

  React.useEffect(() => {
    const wasClosedNowOpen = !previousIsOpenRef.current && forceOpen;
    previousIsOpenRef.current = forceOpen;

    if (wasClosedNowOpen) {
      setCurrentStep(0);
    }
    setIsOpen(forceOpen);
  }, [forceOpen, setIsOpen, setCurrentStep]);

  return null;
}

// How long a target must hold still before the popover appears, and the
// longest a missing or ever-moving target can hold the popover back.
const SETTLE_MS = 150;
const MAX_SETTLE_MS = 1500;

function measureStep(step: StepType): DOMRect | null {
  const selectors = step.highlightedSelectors?.length
    ? step.highlightedSelectors
    : typeof step.selector === "string"
      ? [step.selector]
      : [];
  let union: DOMRect | null = null;
  for (const selector of selectors) {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) continue;
    union = union
      ? new DOMRect(
          Math.min(union.left, rect.left),
          Math.min(union.top, rect.top),
          Math.max(union.right, rect.right) - Math.min(union.left, rect.left),
          Math.max(union.bottom, rect.bottom) - Math.min(union.top, rect.top),
        )
      : rect;
  }
  return union;
}

type TargetState = "settling" | "shown" | "missing";

const rectKey = (rect: DOMRect | null) =>
  rect
    ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`
    : "";

/**
 * Keeps the highlight on the step's target while it moves. Reactour measures
 * once per step and again only on window resize, so a modal still sliding in,
 * a lazily mounted tool section or a target that renders a beat late leaves the
 * highlight on a stale rect, over a neighbouring control. This re-measures every frame and,
 * when the target moves, re-renders the tour (which re-queries the selector)
 * and fires a resize (which re-reads the rect of an element it already has).
 */
function TargetTracker({
  onStateChange,
}: {
  onStateChange: (state: TargetState) => void;
}) {
  const { currentStep, steps, setMeta } = useTour();
  const step = steps[currentStep];

  // Layout effect: the popover must be hidden before the new step's first paint.
  React.useLayoutEffect(() => {
    if (!step) return;
    let reported: TargetState = "settling";
    onStateChange(reported);
    const startedAt = performance.now();
    let lastKey: string | null = null;
    let stableSince = startedAt;
    let resizePending = false;
    let scrolled = false;
    let settled = false;
    let frame = 0;

    const tick = (now: number) => {
      if (resizePending) {
        resizePending = false;
        window.dispatchEvent(new Event("resize"));
      }
      const rect = measureStep(step);
      if (rect && !scrolled) {
        scrolled = true;
        const offscreen = rect.top < 0 || rect.bottom > window.innerHeight;
        if (offscreen && rect.height < window.innerHeight) {
          const first = step.highlightedSelectors?.[0] ?? step.selector;
          const target =
            typeof first === "string" ? document.querySelector(first) : first;
          target?.scrollIntoView({ block: "nearest", behavior: "instant" });
        }
      }
      const key = rectKey(rect);
      if (key !== lastKey) {
        lastKey = key;
        stableSince = now;
        setMeta?.(`${currentStep}:${key}`);
        resizePending = true;
      }
      if (
        !settled &&
        ((key && now - stableSince >= SETTLE_MS) ||
          now - startedAt >= MAX_SETTLE_MS)
      ) {
        settled = true;
      }
      const state: TargetState = !settled
        ? "settling"
        : key
          ? "shown"
          : "missing";
      if (state !== reported) {
        reported = state;
        onStateChange(state);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step, currentStep, setMeta, onStateChange]);

  return null;
}

interface AdvanceArgs {
  setCurrentStep: (value: number | ((prev: number) => number)) => void;
  currentStep: number;
  steps?: StepType[];
  setIsOpen: (value: boolean) => void;
}

interface CloseArgs {
  setIsOpen: (value: boolean) => void;
}

interface OnboardingTourProps {
  tourSteps: StepType[];
  // Open tour id (see tourRegistry.ts); "admin" gets the dark mask.
  tourType: string;
  isRTL: boolean;
  t: TFunction;
  isOpen: boolean;
  onAdvance: (args: AdvanceArgs) => void;
  onClose: (args: CloseArgs) => void;
  dimBackground?: boolean;
}

export default function OnboardingTour({
  tourSteps,
  tourType,
  isRTL,
  t,
  isOpen,
  onAdvance,
  onClose,
  dimBackground = true,
}: OnboardingTourProps) {
  const [targetState, setTargetState] = React.useState<TargetState>("settling");

  if (!isOpen) return null;

  // The highlight glides between steps; the popover fades in place once its
  // target holds still, rather than sliding across the screen from the last step.
  const highlightTransition =
    "x 0.25s ease, y 0.25s ease, width 0.25s ease, height 0.25s ease";

  return (
    <TourProvider
      key={`${tourType}-${i18n.language}`}
      steps={tourSteps}
      maskClassName={tourType === "admin" ? "admin-tour-mask" : undefined}
      onClickClose={onClose}
      onClickMask={onAdvance}
      onClickHighlighted={(e, clickProps) => {
        e.stopPropagation();
        onAdvance(clickProps);
      }}
      keyboardHandler={(e, clickProps, status) => {
        if (e.key === "ArrowRight" && !status?.isRightDisabled && clickProps) {
          e.preventDefault();
          onAdvance(clickProps);
        } else if (e.key === "Escape" && !status?.isEscDisabled && clickProps) {
          e.preventDefault();
          onClose(clickProps);
        }
      }}
      rtl={isRTL}
      styles={{
        popover: (base) => ({
          ...base,
          backgroundColor: "var(--mantine-color-body)",
          color: "var(--mantine-color-text)",
          borderRadius: "8px",
          padding: "20px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          maxWidth: "400px",
          opacity: targetState === "settling" ? 0 : 1,
          transition:
            targetState === "settling" ? "none" : "opacity 0.18s ease",
          // A step whose target never rendered (a section this server does not
          // offer) would otherwise be placed against a zero rect at the corner.
          ...(targetState === "missing" && {
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }),
        }),
        maskWrapper: (base) => ({
          ...base,
          // 0 = no dim: the page stays fully visible behind the popover.
          opacity: dimBackground ? 0.7 : 0,
        }),
        maskArea: (base) => ({
          ...base,
          rx: 8,
          transition: highlightTransition,
          ...(targetState === "missing" && { display: "none" }),
        }),
        // Replaces reactour's own highlightedArea style, which is what shows the
        // rect when interaction is disabled; this tour always disables it.
        highlightedArea: (base) => ({
          ...base,
          display: targetState === "missing" ? "none" : "block",
          transition: highlightTransition,
        }),
        badge: (base) => ({
          ...base,
          backgroundColor: "var(--mantine-primary-color-filled)",
        }),
        controls: (base) => ({
          ...base,
          justifyContent: "center",
        }),
      }}
      highlightedMaskClassName="tour-highlight-glow"
      showNavigation={true}
      showBadge={false}
      showCloseButton={true}
      disableInteraction={true}
      disableDotsNavigation={false}
      prevButton={() => null}
      nextButton={({
        currentStep: tourCurrentStep,
        stepsLength,
        setCurrentStep,
        setIsOpen,
      }) => {
        const isLast = tourCurrentStep === stepsLength - 1;
        return (
          <ActionIcon
            onClick={() =>
              onAdvance({
                setCurrentStep,
                currentStep: tourCurrentStep,
                steps: tourSteps,
                setIsOpen,
              })
            }
            variant="tertiary"
            size="lg"
            aria-label={
              isLast
                ? t("onboarding.finish", "Finish")
                : t("onboarding.next", "Next")
            }
          >
            {isLast ? (
              <Icon name="check" />
            ) : (
              <Icon name={isRTL ? "arrow-left" : "arrow-right"} />
            )}
          </ActionIcon>
        );
      }}
      components={{
        Close: ({ onClick }) => (
          <ActionIcon
            onClick={onClick}
            variant="tertiary"
            size="md"
            aria-label={t("onboarding.close", "Close")}
            style={{ position: "absolute", top: "8px", right: "8px" }}
          >
            &times;
          </ActionIcon>
        ),
        Content: ({ content }: { content: string }) => (
          <div style={{ paddingRight: "16px" }}>
            {renderTourContent(content)}
          </div>
        ),
      }}
    >
      <TourContent forceOpen={true} />
      <TargetTracker onStateChange={setTargetState} />
    </TourProvider>
  );
}

export type { AdvanceArgs, CloseArgs };
