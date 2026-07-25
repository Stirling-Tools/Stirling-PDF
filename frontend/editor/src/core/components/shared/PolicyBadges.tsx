import type React from "react";
import { Tooltip } from "@mantine/core";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import RemoveCircleOutlineRoundedIcon from "@mui/icons-material/RemoveCircleOutlineRounded";
import { useTranslation } from "react-i18next";
import "@app/components/shared/PolicyBadges.css";

/** A policy that has run on this file, used for the activity badges. */
export interface FileItemPolicyRef {
  id: string;
  name: string;
  /** CSS colour for the badge (matches the policy's accent). */
  accentColor: string;
  /** True only just after the policy was applied — drives the one-off glow, so
   *  it doesn't replay on every reload of an already-enforced file. */
  recent: boolean;
  /** True while the policy run is actively in-flight on this file. */
  enforcing?: boolean;
  /** The policy's LATEST run on this file failed — needs review to be trusted. */
  failed?: boolean;
  /** A failed run the reviewer waived. Shows a skip glyph, never the "ran"
   *  shield — the policy didn't succeed. */
  ignored?: boolean;
}

const MAX_VISIBLE = 3;

/**
 * The canonical policy badge row: one accent-tinted shield per policy that has
 * run on a file, spinning while a run is in flight, glowing briefly after it
 * lands. Every surface that shows per-file policy badges (file sidebar, file
 * editor thumbnails, files page) renders this so they stay identical.
 *
 * A file needing review shows ONLY its amber warning badge(s) — healthy shields
 * are suppressed so the warning is unmissable however many policies ran.
 */
export function PolicyBadges({
  policies,
  className,
  onReviewClick,
}: {
  policies: FileItemPolicyRef[];
  /** Appended to the row for surface-specific layout (spacing only). */
  className?: string;
  /** When set, a needs-review badge becomes a button that opens the review flow.
   *  Omit to leave the badge informational. */
  onReviewClick?: () => void;
}) {
  const { t } = useTranslation();
  const failedRefs = policies.filter((p) => p.failed && !p.enforcing);
  const visible = failedRefs.length > 0 ? failedRefs : policies;
  if (visible.length === 0) return null;
  return (
    <span
      className={`policy-badges${className ? ` ${className}` : ""}`}
      data-no-select
    >
      {visible.slice(0, MAX_VISIBLE).map((policy) => {
        const failed = !!policy.failed && !policy.enforcing;
        const ignored = !!policy.ignored && !policy.enforcing && !failed;
        const clickable = failed && !!onReviewClick;
        const activate = clickable
          ? (e: React.SyntheticEvent) => {
              e.preventDefault();
              e.stopPropagation();
              onReviewClick();
            }
          : undefined;
        return (
          <Tooltip
            key={policy.id}
            label={
              policy.enforcing
                ? t("policy.badgeEnforcing", "{{name}} enforcing…", {
                    name: policy.name,
                  })
                : failed
                  ? clickable
                    ? t(
                        "policy.badgeFailedAction",
                        "{{name}} policy failed — click to review",
                        { name: policy.name },
                      )
                    : t(
                        "policy.badgeFailed",
                        "{{name}} policy failed on this file — needs review",
                        { name: policy.name },
                      )
                  : ignored
                    ? t(
                        "policy.badgeIgnored",
                        "{{name}} policy failed but was reviewed and ignored",
                        { name: policy.name },
                      )
                    : t("policy.badgeRan", "{{name}} policy ran on this file", {
                        name: policy.name,
                      })
            }
            withArrow
            position="top"
            withinPortal
          >
            <span
              className={`policy-badge${policy.enforcing ? " policy-badge--enforcing" : ""}${policy.recent && !policy.enforcing ? " policy-badge--recent" : ""}${clickable ? " policy-badge--clickable" : ""}`}
              style={{
                color: failed ? "var(--c-warning)" : policy.accentColor,
              }}
              {...(clickable
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-label": t(
                      "policy.badgeFailedAction",
                      "{{name}} policy failed — click to review",
                      { name: policy.name },
                    ),
                    onClick: activate,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") activate?.(e);
                    },
                  }
                : {})}
            >
              {policy.enforcing ? (
                <AutorenewIcon sx={{ fontSize: "0.7rem" }} />
              ) : failed ? (
                <WarningAmberRoundedIcon sx={{ fontSize: "0.7rem" }} />
              ) : ignored ? (
                <RemoveCircleOutlineRoundedIcon sx={{ fontSize: "0.7rem" }} />
              ) : (
                <ShieldOutlinedIcon sx={{ fontSize: "0.7rem" }} />
              )}
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}
