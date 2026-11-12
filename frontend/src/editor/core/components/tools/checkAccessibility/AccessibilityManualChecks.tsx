import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Checkbox } from "@editor/ui/Checkbox";
import { BreakdownRow } from "@editor/components/tools/checkAccessibility/AccessibilityBreakdownRow";

interface AccessibilityManualChecksProps {
  checks: string[];
  /** Indexes into `checks` the user has ticked. */
  ticked: ReadonlySet<number>;
  onToggle: (index: number) => void;
  /** Ticks every check, or clears them all when `done` is false. */
  onSetAll: (done: boolean) => void;
}

/** The checks a person has to make, as a breakdown row whose ticks go into the downloaded report. */
export function AccessibilityManualChecks({
  checks,
  ticked,
  onToggle,
  onSetAll,
}: AccessibilityManualChecksProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  const allDone = ticked.size === checks.length;

  return (
    <li className="a11y-area">
      <BreakdownRow
        icon="user-check"
        label={t("checkAccessibility.manual.title", "Manual checks")}
        tip={t(
          "checkAccessibility.manual.tip",
          "Things only a person can judge, such as reading order and whether image descriptions make sense. Tick each one once you've checked it, and your ticks go into the downloaded report.",
        )}
        status={allDone ? "done" : "inProgress"}
        toggle={{
          open,
          controls: bodyId,
          onToggle: () => setOpen((value) => !value),
        }}
      />
      <div
        id={bodyId}
        className="sui-collapsible__body"
        data-open={open}
        inert={!open}
      >
        <div className="sui-collapsible__body-inner a11y-area__body">
          <ul className="a11y-manual">
            {checks.map((check, index) => (
              <li key={check}>
                <Checkbox
                  label={check}
                  checked={ticked.has(index)}
                  onChange={() => onToggle(index)}
                />
              </li>
            ))}
          </ul>
          <Button
            className="a11y-manual__all"
            variant="tertiary"
            size="sm"
            onClick={() => onSetAll(!allDone)}
          >
            {allDone
              ? t("checkAccessibility.manual.clearAll", "Clear all")
              : t("checkAccessibility.manual.markAllDone", "Mark all as done")}
          </Button>
        </div>
      </div>
    </li>
  );
}
