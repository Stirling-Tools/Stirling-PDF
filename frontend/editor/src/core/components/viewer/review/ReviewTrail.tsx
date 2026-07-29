import { useTranslation } from "react-i18next";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import RemoveCircleOutlineRoundedIcon from "@mui/icons-material/RemoveCircleOutlineRounded";
import { StatusBadge } from "@app/ui/StatusBadge";
import { Chip } from "@app/ui/Chip";
import { formatRelativeTime } from "@app/utils/timeUtils";
import {
  ReviewRunSource,
  ReviewStepStatus,
  ReviewTrailRun,
  ReviewTrailStep,
} from "@app/types/review";
import "@app/components/viewer/review/ReviewTrail.css";

const SOURCE_TONE: Record<ReviewRunSource, "neutral" | "info" | "purple"> = {
  tool: "neutral",
  policy: "info",
  pipeline: "purple",
};

/** The rail/badge status for a whole run — a failure dominates. */
function runStatus(run: ReviewTrailRun): "completed" | "failed" | "skipped" {
  if (run.steps.some((s) => s.status === "failed")) return "failed";
  if (run.steps.every((s) => s.status === "completed")) return "completed";
  return "skipped";
}

function StepStatusIcon({ status }: { status: ReviewStepStatus }) {
  const sx = { fontSize: "1rem" } as const;
  if (status === "completed") return <CheckCircleRoundedIcon sx={sx} />;
  if (status === "failed") return <CancelRoundedIcon sx={sx} />;
  return <RemoveCircleOutlineRoundedIcon sx={sx} />;
}

function TrailStepRow({ step }: { step: ReviewTrailStep }) {
  const { t } = useTranslation();
  const name = step.toolId
    ? t(`home.${step.toolId}.title`, step.toolId)
    : (step.label ?? "");
  const failed = step.status === "failed";

  return (
    <div className="review-trail__step" data-status={step.status}>
      <span className="review-trail__step-icon">
        <StepStatusIcon status={step.status} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="review-trail__step-name" data-failed={failed}>
          {name}
          {failed && (
            <span className="review-trail__step-fail">
              {" — "}
              {t("reviewTool.trail.stepFailed", "failed")}
            </span>
          )}
        </div>
        {step.detail && (
          <div className="review-trail__detail" data-failed={failed}>
            {step.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function TrailRun({ run }: { run: ReviewTrailRun }) {
  const { t } = useTranslation();
  const sourceLabel = t(`reviewTool.trail.source.${run.source}`, run.source);

  return (
    <div className="review-trail__run" data-status={runStatus(run)}>
      <span className="review-trail__rail" aria-hidden />
      <div className="review-trail__body">
        <div className="review-trail__head">
          <StatusBadge tone={SOURCE_TONE[run.source]} size="sm" showDot={false}>
            {sourceLabel}
          </StatusBadge>
          <span className="review-trail__name" title={run.name}>
            {run.name}
          </span>
          <span className="review-trail__time">
            {formatRelativeTime(run.timestamp, t)}
          </span>
        </div>
        {run.steps.map((step) => (
          <TrailStepRow key={step.id} step={step} />
        ))}
        {run.tags && run.tags.length > 0 && (
          <div className="review-trail__tags">
            {run.tags.map((tag) => (
              <Chip key={tag} size="sm">
                {tag}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Everything that ran on the file under review, oldest-first. */
export function ReviewTrail({ trail }: { trail: ReviewTrailRun[] }) {
  return (
    <div className="review-trail">
      {trail.map((run) => (
        <TrailRun key={run.id} run={run} />
      ))}
    </div>
  );
}
