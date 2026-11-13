import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@editor/ui/Icon";
import { BreakdownRow } from "@editor/components/tools/checkAccessibility/AccessibilityBreakdownRow";
import { AccessibilityIssueItem } from "@editor/components/tools/checkAccessibility/AccessibilityIssueItem";
import {
  categoryLabel,
  categoryReference,
  categoryTip,
} from "@editor/utils/accessibilityReportContent";
import type {
  AccessibilityArea,
  AccessibilityCategoryId,
} from "@editor/utils/accessibilityAssessment";

const CATEGORY_ICON: Record<AccessibilityCategoryId, IconName> = {
  structure: "layers",
  altText: "image",
  language: "globe",
  metadata: "file-text",
  fonts: "type",
  links: "link",
};

interface AccessibilityAreaItemProps {
  area: AccessibilityArea;
  /** The report's profile, e.g. "PDF/UA-1", for the tooltip's clause reference. */
  profile: string;
  /** Shown under the issues, such as how many images need a description. */
  note: string | null;
}

/** One breakdown area: its result, and its issues behind a toggle when there is anything to show. */
export function AccessibilityAreaItem({
  area,
  profile,
  note,
}: AccessibilityAreaItemProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const passes = area.issues.length === 0;
  const expandable = !passes || note !== null;

  return (
    <li className="a11y-area">
      <BreakdownRow
        icon={CATEGORY_ICON[area.id]}
        label={categoryLabel(t, area.id)}
        tip={categoryTip(t, area.id)}
        reference={categoryReference(t, profile, area.id)}
        status={passes ? "pass" : "fail"}
        toggle={
          expandable
            ? {
                open,
                controls: bodyId,
                onToggle: () => setOpen((value) => !value),
              }
            : undefined
        }
      />
      {expandable && (
        <div
          id={bodyId}
          className="sui-collapsible__body"
          data-open={open}
          inert={!open}
        >
          <div className="sui-collapsible__body-inner a11y-area__body">
            {!passes && (
              <div className="a11y-issues">
                {area.issues.map((issue) => (
                  <AccessibilityIssueItem
                    key={`${issue.clause}-${issue.testNumber}`}
                    issue={issue}
                  />
                ))}
              </div>
            )}
            {note && (
              <p className="a11y-note a11y-inline">
                <Icon name="image" size={14} />
                {note}
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
