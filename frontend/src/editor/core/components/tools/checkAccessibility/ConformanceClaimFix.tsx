import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { Button } from "@editor/ui/Button";
import { Checkbox } from "@editor/ui/Checkbox";
import { Icon } from "@editor/ui/Icon";
import {
  useConformanceClaim,
  type CheckedFileClaim,
} from "@editor/hooks/tools/checkAccessibility/useConformanceClaimControl";
import type { PdfUaPart } from "@editor/tools/pdfTextEditor/pdfdoc/passes/conformanceClaim";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
import { conformanceClaimFixFor } from "@editor/utils/accessibilityFixes";

/** The report's file's claim; null where the report cannot change it. */
export const ConformanceClaimContext = createContext<CheckedFileClaim | null>(
  null,
);

/** Declares the part `issue` was checked against, for an issue declaring fixes. */
export function DeclareConformanceButton({
  issue,
}: {
  issue: AccessibilityIssue;
}) {
  const { t } = useTranslation();
  const claim = useConformanceClaim(useContext(ConformanceClaimContext));
  const part = conformanceClaimFixFor(issue);
  if (!claim?.editable || part === null) return null;
  const declared = claim.part === part;
  return (
    <Button
      size="sm"
      variant="secondary"
      leftSection={
        <Icon name={declared ? "check" : "shield-check"} size={14} />
      }
      loading={claim.writing}
      disabled={declared}
      onClick={() => claim.set(part)}
      data-testid="a11y-declare-conformance"
    >
      {declared
        ? t("checkAccessibility.fix.conformanceDeclared", {
            defaultValue: "PDF/UA-{{part}} declared",
            part,
          })
        : t("checkAccessibility.fix.declareConformance", {
            defaultValue: "Declare PDF/UA-{{part}}",
            part,
          })}
    </Button>
  );
}

/** Declares `part` when ticked, and withdraws the claim when unticked. */
export function ConformanceClaimField({ part }: { part: PdfUaPart }) {
  const { t } = useTranslation();
  const claim = useConformanceClaim(useContext(ConformanceClaimContext));
  if (!claim) return null;
  const hint = t("checkAccessibility.claim.hint", {
    defaultValue:
      "Records in the file's metadata that it meets PDF/UA-{{part}}. Accessibility checkers look for this. Tick it once the file meets the standard.",
    part,
  });
  return (
    <Checkbox
      checked={claim.declared}
      onChange={(event) => claim.set(event.currentTarget.checked ? part : null)}
      disabled={!claim.editable || claim.writing}
      label={
        <Tooltip
          content={hint}
          position="top"
          sidebarTooltip={false}
          offset={6}
          arrow
          portalTarget={document.body}
        >
          <span>
            {t(
              "checkAccessibility.claim.label",
              "Declare file as PDF/UA compliant",
            )}
          </span>
        </Tooltip>
      }
      // The tooltip opens on hover only; the input carries the hint for keyboard and screen readers.
      aria-description={hint}
      data-testid="a11y-conformance-claim"
    />
  );
}
