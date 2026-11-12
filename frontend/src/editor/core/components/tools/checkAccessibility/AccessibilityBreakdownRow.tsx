import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Chip } from "@editor/ui/Chip";
import { Icon, type IconName } from "@editor/ui/Icon";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import type { AccessibilityResult } from "@editor/utils/accessibilityAssessment";

/** Every result word stacked in one cell, so each pill is as wide as the longest in any language. */
function ResultWord({ result }: { result: AccessibilityResult }) {
  const { t } = useTranslation();
  const words: Record<AccessibilityResult, string> = {
    pass: t("checkAccessibility.result.pass", "Pass"),
    partial: t("checkAccessibility.result.partial", "Partial"),
    fail: t("checkAccessibility.result.fail", "Fail"),
  };
  return (
    <span className="a11y-result-word">
      {(Object.keys(words) as AccessibilityResult[]).map((key) => (
        <span
          key={key}
          data-active={key === result}
          aria-hidden={key !== result}
        >
          {words[key]}
        </span>
      ))}
    </span>
  );
}

interface BreakdownRowProps {
  icon: IconName;
  label: string;
  tip: string;
  passes: boolean;
  /** Turns the label into a toggle for the details below the row. */
  toggle?: { open: boolean; controls: string; onToggle: () => void };
}

export function BreakdownRow({
  icon,
  label,
  tip,
  passes,
  toggle,
}: BreakdownRowProps) {
  const content: ReactNode = (
    <>
      <Icon name={icon} size={16} />
      <span className="a11y-breakdown__label">{label}</span>
    </>
  );
  return (
    <div className="a11y-area__row">
      {toggle ? (
        <button
          type="button"
          className="a11y-area__toggle a11y-area__toggle--button"
          aria-expanded={toggle.open}
          aria-controls={toggle.controls}
          onClick={toggle.onToggle}
        >
          <Icon
            name="chevron-down"
            size={16}
            strokeWidth={2}
            className="a11y-area__chevron"
          />
          {content}
        </button>
      ) : (
        <span className="a11y-area__toggle">
          <span className="a11y-area__chevron" />
          {content}
        </span>
      )}
      <InfoTooltip label={tip} />
      <Chip
        className="a11y-area__status"
        accent={passes ? "success" : "danger"}
        size="xs"
      >
        <ResultWord result={passes ? "pass" : "fail"} />
      </Chip>
    </div>
  );
}
