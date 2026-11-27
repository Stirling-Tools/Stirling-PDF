import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Checkbox } from "@editor/ui/Checkbox";
import { Chip } from "@editor/ui/Chip";
import { BreakdownRow } from "@editor/components/tools/checkAccessibility/AccessibilityBreakdownRow";

interface AccessibilityManualChecksProps {
  checks: string[];
  /** Indexes into `checks` the user has ticked. */
  ticked: ReadonlySet<number>;
  onToggle: (index: number) => void;
  /** Ticks every check, or clears them all when `done` is false. */
  onSetAll: (done: boolean) => void;
}

/**
 * The checks only a person can make, as a breakdown row that opens on the list; the
 * ticks go into the downloaded report.
 */
export function AccessibilityManualChecks({
  checks,
  ticked,
  onToggle,
  onSetAll,
}: AccessibilityManualChecksProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const allDone = ticked.size === checks.length;
  return (
    <li className="a11y-area" data-testid="a11y-manual-checks">
      <BreakdownRow
        icon="list-checks"
        label={t("checkAccessibility.manual.title", "Manual checks")}
        tip={t(
          "checkAccessibility.manual.tip",
          "Things only a person can judge, such as reading order and whether image descriptions make sense. Tick each one once you've checked it, and your ticks go into the downloaded report.",
        )}
        status={allDone ? "pass" : "fail"}
        badge={
          <span className="a11y-manual__status">
            <span className="a11y-manual__count">{`${ticked.size}/${checks.length}`}</span>
            <Chip
              accent={allDone ? "success" : "warning"}
              size="xs"
              data-testid="a11y-manual-status"
            >
              {allDone
                ? t("checkAccessibility.manual.done", "Done")
                : t("checkAccessibility.manual.inProgress", "In progress")}
            </Chip>
          </span>
        }
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
            variant="secondary"
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
