import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Chip, type ChipAccent } from "@editor/ui/Chip";
import { Icon, type IconName } from "@editor/ui/Icon";
import { Tooltip } from "@editor/components/shared/Tooltip";

export type BreakdownStatus = "pass" | "fail" | "inProgress" | "done";

const STATUS_ACCENT: Record<BreakdownStatus, ChipAccent> = {
  pass: "success",
  fail: "danger",
  inProgress: "warning",
  done: "success",
};

/** Every status word stacked in one cell, so each pill is as wide as the longest in any language. */
function StatusWord({ status }: { status: BreakdownStatus }) {
  const { t } = useTranslation();
  const words: Record<BreakdownStatus, string> = {
    pass: t("checkAccessibility.result.pass", "Pass"),
    fail: t("checkAccessibility.result.fail", "Fail"),
    inProgress: t("checkAccessibility.manual.inProgress", "In progress"),
    done: t("checkAccessibility.manual.done", "Done"),
  };
  return (
    <span className="a11y-result-word">
      {(Object.keys(words) as BreakdownStatus[]).map((key) => (
        <span
          key={key}
          data-active={key === status}
          aria-hidden={key !== status}
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
  /** The standard's clauses the row covers, shown under the tip. */
  reference?: string | null;
  status: BreakdownStatus;
  /** Turns the label into a toggle for the details below the row. */
  toggle?: { open: boolean; controls: string; onToggle: () => void };
}

export function BreakdownRow({
  icon,
  label,
  tip,
  reference,
  status,
  toggle,
}: BreakdownRowProps) {
  const { t } = useTranslation();
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
      <Tooltip
        content={
          <span className="a11y-tip">
            {tip}
            {reference && (
              <span className="a11y-tip__reference">{reference}</span>
            )}
          </span>
        }
        position="top"
        maxWidth={280}
        arrow
      >
        <button
          type="button"
          className="a11y-area__info"
          aria-label={t("checkAccessibility.aboutRow", "About {{label}}", {
            label,
          })}
        >
          <Icon name="info" size={14} />
        </button>
      </Tooltip>
      <Chip
        className="a11y-area__status"
        accent={STATUS_ACCENT[status]}
        size="xs"
      >
        <StatusWord status={status} />
      </Chip>
    </div>
  );
}
