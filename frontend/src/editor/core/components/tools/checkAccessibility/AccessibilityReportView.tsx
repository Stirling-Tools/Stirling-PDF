import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@editor/ui/Card";
import { Chip } from "@editor/ui/Chip";
import { Icon, type IconName } from "@editor/ui/Icon";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { ProgressBar } from "@editor/ui/ProgressBar";
import { SectionHeader } from "@editor/ui/SectionHeader";
import { ScoreRing } from "@editor/components/tools/checkAccessibility/ScoreRing";
import { AccessibilityIssueItem } from "@editor/components/tools/checkAccessibility/AccessibilityIssueItem";
import {
  categoryLabel,
  categoryTip,
  documentBasics,
  figuresSummary,
  gradeLabel,
} from "@editor/utils/accessibilityReportContent";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";
import {
  scoreAccessibilityReport,
  type AccessibilityCategoryId,
} from "@editor/utils/accessibilityScore";

const CATEGORY_ICON: Record<AccessibilityCategoryId, IconName> = {
  structure: "layers",
  altText: "image",
  language: "globe",
  metadata: "file-text",
  fonts: "type",
  links: "link",
};

const barColor = (fraction: number) =>
  fraction >= 0.999
    ? "var(--c-success)"
    : fraction >= 0.5
      ? "var(--c-warning)"
      : "var(--c-danger)";

interface FactProps {
  ok: boolean;
  label: ReactNode;
}

function Fact({ ok, label }: FactProps) {
  return (
    <li className="a11y-fact">
      <Icon
        name={ok ? "circle-check" : "circle-x"}
        size={16}
        style={{ color: ok ? "var(--c-success)" : "var(--c-danger)" }}
      />
      <span>{label}</span>
    </li>
  );
}

interface BreakdownValueProps {
  failed: number;
  total: number | undefined;
}

function BreakdownValue({ failed, total }: BreakdownValueProps) {
  const { t } = useTranslation();
  if (total !== undefined) {
    const passed = Math.max(0, total - failed);
    return (
      <span
        className="a11y-breakdown__value"
        role="img"
        aria-label={t(
          "checkAccessibility.breakdown.passing",
          "{{passed}} of {{total}} rules pass",
          { passed, total },
        )}
      >
        {passed}/{total}
      </span>
    );
  }
  return (
    <span className="a11y-breakdown__value">
      {failed > 0 ? (
        t("checkAccessibility.breakdown.failingCount", "{{count}} failing", {
          count: failed,
        })
      ) : (
        <Icon
          name="check"
          size={14}
          style={{ color: "var(--c-success)" }}
          aria-label={t("checkAccessibility.breakdown.ok", "No issues")}
        />
      )}
    </span>
  );
}

interface AccessibilityReportViewProps {
  report: AccessibilityReport;
  /** Identifies the file, so switching files replays the ring even at equal scores. */
  reportKey: string;
}

export function AccessibilityReportView({
  report,
  reportKey,
}: AccessibilityReportViewProps) {
  const { t } = useTranslation();
  const scored = useMemo(() => scoreAccessibilityReport(report), [report]);
  const [showBasics, setShowBasics] = useState(true);
  const [showManual, setShowManual] = useState(true);
  const idPrefix = useId();
  const areaSections = useRef<
    Partial<Record<AccessibilityCategoryId, HTMLElement | null>>
  >({});
  const areaId = (id: AccessibilityCategoryId) => `${idPrefix}-area-${id}`;
  // Focus follows the jump so keyboard and screen reader users land where sighted users look.
  const jumpToArea = (id: AccessibilityCategoryId) => {
    const section = areaSections.current[id];
    if (!section) return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    section.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    section.focus({ preventScroll: true });
  };
  const { summary, checks } = report;

  const basics = documentBasics(t, report);
  const basicsMet = basics.filter((fact) => fact.ok).length;
  const failingAreas = scored.categories.filter(
    (category) => category.issues.length > 0,
  );
  const figures = figuresSummary(t, report);

  return (
    <div className="a11y-report" data-testid="a11y-report">
      <Card padding="default" className="a11y-hero">
        <ScoreRing
          score={scored.score}
          grade={scored.grade}
          replayKey={reportKey}
          label={t(
            "checkAccessibility.score.aria",
            "Accessibility score {{score}} out of 100",
            { score: scored.score },
          )}
        />
        <div className="a11y-hero__text">
          <span
            className={`a11y-hero__grade a11y-hero__grade--${scored.grade}`}
          >
            {gradeLabel(t, scored.grade)}
          </span>
          <span className="a11y-hero__sub">
            {t(
              "checkAccessibility.score.subtitle",
              "{{profile}} · {{count}} pages",
              {
                profile: report.profile,
                count: summary.pages,
              },
            )}
          </span>
          <span className="a11y-hero__sub a11y-inline">
            {report.issues.length === 0
              ? t("checkAccessibility.score.noIssues", "No issues found")
              : t("checkAccessibility.score.issues", "{{count}} issues", {
                  count: report.issues.length,
                })}
            {checks && (
              <InfoTooltip
                label={t(
                  "checkAccessibility.score.checksTip",
                  "{{failed}} of {{total}} checks failed, across {{rules}} of {{ruleTotal}} PDF/UA rules.",
                  {
                    failed: checks.failed.toLocaleString(),
                    total: checks.total.toLocaleString(),
                    rules: checks.rulesFailed,
                    ruleTotal: checks.rulesInProfile,
                  },
                )}
              />
            )}
          </span>
          {!report.tagged && (
            <span className="a11y-inline">
              <Chip size="xs" accent="danger">
                {t("checkAccessibility.chip.untagged", "Untagged")}
              </Chip>
              <InfoTooltip
                label={t(
                  "checkAccessibility.score.untaggedTip",
                  "Screen readers can't follow an untagged PDF, so its score is halved.",
                )}
              />
            </span>
          )}
        </div>
      </Card>

      <section className="a11y-section">
        <SectionHeader
          title={
            <span className="a11y-inline">
              {t("checkAccessibility.sections.breakdown", "Breakdown")}
              <InfoTooltip
                label={t(
                  "checkAccessibility.score.how",
                  "Each bar is how much of that area's share of the 100 points this file keeps. The numbers beside it are how many of that area's rules pass, out of how many it has. An area's first failing rule halves its share, and each further rule takes more. Untagged PDFs have their score halved.",
                )}
              />
            </span>
          }
        />
        <ul className="a11y-breakdown">
          {scored.categories.map((category) => {
            const fraction = category.points / category.weight;
            const failed = category.issues.length;
            return (
              <li key={category.id} className="a11y-breakdown__row">
                <Icon name={CATEGORY_ICON[category.id]} size={16} />
                <span className="a11y-breakdown__name">
                  {failed > 0 ? (
                    <button
                      type="button"
                      className="a11y-breakdown__label a11y-breakdown__link"
                      onClick={() => jumpToArea(category.id)}
                    >
                      {categoryLabel(t, category.id)}
                    </button>
                  ) : (
                    <span className="a11y-breakdown__label">
                      {categoryLabel(t, category.id)}
                    </span>
                  )}
                  <InfoTooltip label={categoryTip(t, category.id)} />
                </span>
                <BreakdownValue
                  failed={failed}
                  total={category.rulesInProfile}
                />
                <ProgressBar
                  className="a11y-breakdown__bar"
                  value={fraction}
                  height={4}
                  color={barColor(fraction)}
                  label={categoryLabel(t, category.id)}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {failingAreas.map((category) => (
        <section
          key={category.id}
          id={areaId(category.id)}
          ref={(element) => {
            areaSections.current[category.id] = element;
          }}
          tabIndex={-1}
          className="a11y-section a11y-section--target"
          aria-label={categoryLabel(t, category.id)}
        >
          <SectionHeader
            title={categoryLabel(t, category.id)}
            count={category.issues.length}
          />
          <div className="a11y-issues">
            {category.issues.map((issue) => (
              <AccessibilityIssueItem
                key={`${issue.clause}-${issue.testNumber}`}
                issue={issue}
              />
            ))}
          </div>
        </section>
      ))}

      {figures && (
        <p className="a11y-note a11y-inline">
          <Icon name="image" size={14} />
          {figures}
        </p>
      )}

      <section className="a11y-section">
        <SectionHeader
          title={t("checkAccessibility.sections.basics", "Document basics")}
          count={`${basicsMet}/${basics.length}`}
          collapsible
          expanded={showBasics}
          onToggle={() => setShowBasics((value) => !value)}
        />
        {showBasics && (
          <ul className="a11y-facts">
            {basics.map((fact) => (
              <Fact key={fact.label} ok={fact.ok} label={fact.label} />
            ))}
          </ul>
        )}
      </section>

      {report.humanChecks.length > 0 && (
        <section className="a11y-section">
          <SectionHeader
            title={t("checkAccessibility.sections.manual", "Manual checks")}
            count={report.humanChecks.length}
            collapsible
            expanded={showManual}
            onToggle={() => setShowManual((value) => !value)}
          />
          {showManual && (
            <>
              <p className="a11y-note">
                {t(
                  "checkAccessibility.manual.tip",
                  "Automated checks cover only part of PDF/UA. These need a person.",
                )}
              </p>
              <ul className="a11y-manual">
                {report.humanChecks.map((check) => (
                  <li key={check}>
                    <Icon name="user-check" size={14} />
                    <span>{check}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
