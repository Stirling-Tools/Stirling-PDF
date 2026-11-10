import {
  cloneElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Popover, type FloatingPosition } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@editor/ui/Icon";
import { BrandMark } from "@editor/components/shared/BrandMark";
import type { TooltipTip } from "@editor/types/tips";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@editor/styles/zIndex";
import "@editor/ui/InfoTooltip.css";

const OPEN_DELAY_MS = 160;
const CLOSE_DELAY_MS = 120;

/** Popover sides are physical; mirror them for right-to-left reading. */
const RTL_POSITION: Record<FloatingPosition, FloatingPosition> = {
  top: "top",
  "top-start": "top-end",
  "top-end": "top-start",
  right: "left",
  "right-start": "left-start",
  "right-end": "left-end",
  bottom: "bottom",
  "bottom-start": "bottom-end",
  "bottom-end": "bottom-start",
  left: "right",
  "left-start": "right-start",
  "left-end": "right-end",
};

export interface InfoTooltipProps {
  /** Body content when no structured `tips` are given. */
  label?: ReactNode;
  /** Panel heading. Also seeds the trigger's accessible name. */
  title?: string;
  /** Structured explanation sections, rendered as headings and bullet lists. */
  tips?: TooltipTip[];
  /** Extra JSX rendered below `tips`. */
  content?: ReactNode;
  /** Overrides the accessible name derived from `title`. */
  ariaLabel?: string;
  /** Preferred side of the trigger. Flips automatically when it does not fit. */
  position?: FloatingPosition;
  /** Panel width in px. Shrinks to the viewport on narrow screens. */
  width?: number;
  zIndex?: number;
  /** Trigger glyph. Defaults to the shared (i). */
  icon?: IconName;
  /** Trigger glyph size in px. The hit target stays 24px. */
  iconSize?: number;
  /** Use a caller-owned trigger element instead of the default (i) button. */
  children?: ReactElement;
  disabled?: boolean;
}

/**
 * The app's single explanation affordance: a quiet (i) that previews on hover
 * and pins on click, opening a non-modal disclosure panel.
 *
 * Why a popover rather than a tooltip: these explanations run to several
 * paragraphs, carry links, and must stay readable while the pointer moves over
 * them. WCAG 1.4.13 requires that content opened on hover is hoverable,
 * dismissible and persistent; a `role="tooltip"` bubble cannot satisfy that once
 * it holds interactive content. Mantine's Popover supplies the disclosure
 * semantics (`aria-expanded` / `aria-controls`, `role="dialog"`), viewport-aware
 * positioning and Escape/outside-click dismissal.
 *
 * Clicking while the hover preview is open pins the same mounted panel instead
 * of closing or remounting it, so the bubble never flashes or reflows.
 */
export function InfoTooltip({
  label,
  title,
  tips,
  content,
  ariaLabel,
  position = "top",
  width = 320,
  zIndex = Z_INDEX_OVER_FULLSCREEN_SURFACE,
  icon = "info",
  iconSize = 15,
  children,
  disabled = false,
}: InfoTooltipProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [pinned, setPinned] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  // Closing returns focus to the trigger. Without this guard that programmatic
  // focus reopens the panel we just closed, so Escape and outside clicks would
  // appear to do nothing.
  const ignoreFocusOpenUntil = useRef(0);
  // Hover and focus both keep an unpinned preview open. Pointer leave must not
  // close help the user reached by keyboard, and a blur while the pointer is
  // still over the panel must not close it either.
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  // Only explicit dismissals should pull focus back to the trigger. Tabbing
  // away closes the preview and must leave focus on the next control.
  const returnFocusRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const closeNow = useCallback(
    (returnFocus = true) => {
      clearTimers();
      returnFocusRef.current = returnFocus;
      ignoreFocusOpenUntil.current = Date.now() + 250;
      focusedRef.current = false;
      setPinned(false);
      setOpened(false);
    },
    [clearTimers],
  );

  useEffect(() => clearTimers, [clearTimers]);

  // Native, non-passive: React's wheel handler cannot keep the page behind the
  // panel still while the body owns the gesture. The body keeps its native
  // scroll; only the chained scroll past its end is suppressed.
  useEffect(() => {
    if (!bodyEl) return;
    const handleWheel = (event: WheelEvent) => {
      if (bodyEl.scrollHeight > bodyEl.clientHeight) {
        event.stopPropagation();
      }
    };
    bodyEl.addEventListener("wheel", handleWheel);
    return () => bodyEl.removeEventListener("wheel", handleWheel);
  }, [bodyEl]);

  const scheduleOpen = useCallback(() => {
    if (disabled) return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (opened) return;
    openTimer.current = setTimeout(() => {
      returnFocusRef.current = true;
      setOpened(true);
    }, OPEN_DELAY_MS);
  }, [disabled, opened]);

  const scheduleClose = useCallback(() => {
    if (pinned || hoveredRef.current || focusedRef.current) return;
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    // closeNow, not a bare setOpened: returnFocus puts focus back on the
    // trigger, whose onFocus must be suppressed or the panel reopens instantly.
    closeTimer.current = setTimeout(() => closeNow(false), CLOSE_DELAY_MS);
  }, [closeNow, pinned]);

  const handlePointerEnter = useCallback(() => {
    hoveredRef.current = true;
    if (disabled) return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    scheduleOpen();
  }, [disabled, scheduleOpen]);

  const handlePointerLeave = useCallback(() => {
    hoveredRef.current = false;
    scheduleClose();
  }, [scheduleClose]);

  const handleFocus = useCallback(() => {
    if (disabled || Date.now() < ignoreFocusOpenUntil.current) return;
    focusedRef.current = true;
    returnFocusRef.current = true;
    clearTimers();
    setOpened(true);
  }, [clearTimers, disabled]);

  const handleBlur = useCallback(() => {
    focusedRef.current = false;
    scheduleClose();
  }, [scheduleClose]);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      // Inside a <label> the default action would also toggle the labelled
      // control; the (i) must only manage its own panel.
      event.preventDefault();
      event.stopPropagation();
      clearTimers();
      focusedRef.current = true;
      returnFocusRef.current = true;
      if (pinned) {
        closeNow(true);
        return;
      }
      setOpened(true);
      setPinned(true);
    },
    [clearTimers, closeNow, pinned],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Escape" || !opened) return;
      event.preventDefault();
      event.stopPropagation();
      closeNow(true);
    },
    [closeNow, opened],
  );

  const handleDropdownKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeNow(true);
    },
    [closeNow],
  );

  useEffect(() => {
    if (!opened || !pinned) return;
    // Move keyboard focus into the disclosure once it is pinned, so screen
    // readers announce the panel instead of leaving focus on the trigger.
    const frame = requestAnimationFrame(() => {
      dropdownRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [opened, pinned]);

  // Field help often has no heading, only a sentence. Its first clause is a
  // better accessible name than the generic "More information" repeated on
  // every row, but a long paragraph would make an unusable name, so fall back.
  const firstClause =
    typeof label === "string" ? (label.split(/[.!?]/)[0] ?? "").trim() : "";
  const labelTopic =
    firstClause.length > 0 && firstClause.length <= 120 ? firstClause : "";
  const accessibleName =
    ariaLabel ??
    (title
      ? t("common.moreInformationAbout", "More information about {{topic}}", {
          topic: title,
        })
      : labelTopic
        ? t("common.moreInformationAbout", "More information about {{topic}}", {
            topic: labelTopic,
          })
        : t("common.moreInformation", "More information"));

  const trigger = children ?? (
    <button type="button" className="sui-info" disabled={disabled}>
      <Icon name={icon} size={iconSize} strokeWidth={2} />
    </button>
  );

  // Popover.Target only accepts its own props; attach the interaction handlers
  // to the trigger itself so the target stays the focusable button.
  const interactiveTrigger = cloneElement(
    trigger as ReactElement<Record<string, unknown>>,
    {
      onPointerEnter: handlePointerEnter,
      onPointerLeave: handlePointerLeave,
      onFocus: handleFocus,
      onBlur: handleBlur,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      "aria-label": accessibleName,
    },
  );

  const panelTitle = title ?? t("common.help", "Help");
  const hasStructuredContent = (tips?.length ?? 0) > 0;
  const isRtl =
    typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const resolvedPosition = isRtl ? RTL_POSITION[position] : position;

  return (
    <Popover
      opened={opened}
      onChange={(next) => {
        // Only outside clicks reach here; Escape is handled on the trigger and
        // the dropdown so an explicit dismissal can restore focus.
        if (!next) closeNow(false);
      }}
      position={resolvedPosition}
      offset={8}
      width={width}
      middlewares={{ flip: true, shift: { padding: 8 }, inline: false }}
      withArrow
      arrowSize={8}
      arrowRadius={2}
      radius="md"
      shadow="md"
      zIndex={zIndex}
      trapFocus={false}
      returnFocus={returnFocusRef.current}
      closeOnClickOutside
      closeOnEscape={false}
      transitionProps={{ duration: 120, transition: "fade" }}
    >
      <Popover.Target>{interactiveTrigger}</Popover.Target>
      <Popover.Dropdown
        ref={dropdownRef}
        className="sui-info-panel"
        data-pinned={pinned || undefined}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={(event) => event.stopPropagation()}
        onKeyDownCapture={handleDropdownKeyDown}
      >
        {pinned && (
          <button
            type="button"
            className="sui-info-panel__close"
            onClick={() => closeNow(true)}
            aria-label={t("common.close", "Close")}
          >
            <Icon name="x" size={14} strokeWidth={2} />
          </button>
        )}
        <div className="sui-info-panel__inner">
          {panelTitle && (
            <div className="sui-info-panel__header">
              <span className="sui-info-panel__brand">
                <BrandMark height="1.25rem" decorative />
              </span>
              <span className="sui-info-panel__title">{panelTitle}</span>
            </div>
          )}
          <div ref={setBodyEl} className="sui-info-panel__body">
            {hasStructuredContent
              ? tips?.map((tip, index) => (
                  <section
                    className="sui-info-panel__section"
                    key={`${tip.title ?? "tip"}-${index}`}
                  >
                    {tip.title &&
                      !(index === 0 && tip.title === panelTitle) && (
                        <h3
                          className="sui-info-panel__section-title"
                          dir="auto"
                        >
                          {tip.title}
                        </h3>
                      )}
                    {tip.description && (
                      <p className="sui-info-panel__text" dir="auto">
                        {tip.description}
                      </p>
                    )}
                    {tip.bullets && tip.bullets.length > 0 && (
                      <ul className="sui-info-panel__list">
                        {tip.bullets.map((bullet, bulletIndex) => (
                          <li key={bulletIndex}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                    {tip.body && (
                      <div className="sui-info-panel__body-extra">
                        {tip.body}
                      </div>
                    )}
                  </section>
                ))
              : label && (
                  <p className="sui-info-panel__text" dir="auto">
                    {label}
                  </p>
                )}
            {content && <div className="sui-info-panel__extra">{content}</div>}
          </div>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
