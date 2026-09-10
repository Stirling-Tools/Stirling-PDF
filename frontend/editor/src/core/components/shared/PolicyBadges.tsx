import type { ReactNode } from "react";
import { Tooltip } from "@mantine/core";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import GppBadOutlinedIcon from "@mui/icons-material/GppBadOutlined";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";
import { useTranslation } from "react-i18next";
import "@app/components/shared/PolicyBadges.css";

/** A policy that has run on this file, used for the activity badges. */
export interface FileItemPolicyRef {
  id: string;
  name: string;
  /** CSS colour for the badge (matches the policy's accent). */
  accentColor: string;
  /** True while a BLOCKING policy run is in-flight on this file (gates actions). */
  enforcing?: boolean;
  /** True while a non-blocking run (e.g. classification) is in-flight — shows
   *  the same spinner but never gates anything. */
  background?: boolean;
  /** A required policy failed on this file, so it's blocked until re-run clean.
   *  Rendered as a static error badge, never a spinner; supersedes enforcing. */
  blocked?: boolean;
}

const MAX_VISIBLE = 3;

/** The one state a badge is in, in priority order: blocked wins over a spinner. */
type BadgeState = "blocked" | "running" | "ran";

/** Modifier appended to the base badge class per state. */
const STATE_MODIFIER: Record<BadgeState, string> = {
  blocked: " policy-badge--blocked",
  running: " policy-badge--enforcing",
  ran: "",
};

function badgeState(policy: FileItemPolicyRef): BadgeState {
  if (policy.blocked) return "blocked";
  if (policy.enforcing || policy.background) return "running";
  return "ran";
}

function PolicyBadge({ policy }: { policy: FileItemPolicyRef }) {
  const { t } = useTranslation();
  const state = badgeState(policy);
  const iconStyle = { fontSize: "0.7rem" } as const;

  let label: string;
  let icon: ReactNode;
  if (state === "blocked") {
    label = t(
      "policy.badgeBlocked",
      "{{name}} failed to run - this file is blocked",
      { name: policy.name },
    );
    icon = <GppBadOutlinedIcon sx={iconStyle} />;
  } else if (state === "running") {
    label = policy.enforcing
      ? t("policy.badgeEnforcing", "{{name}} enforcing...", {
          name: policy.name,
        })
      : t("policy.badgeRunning", "{{name}} running...", { name: policy.name });
    icon = <AutorenewIcon sx={iconStyle} />;
  } else {
    label = t("policy.badgeRan", "{{name}} policy ran on this file", {
      name: policy.name,
    });
    icon = policyCategoryIcon(policy.id, iconStyle);
  }

  return (
    <Tooltip label={label} withArrow position="top">
      <span
        className={`policy-badge${STATE_MODIFIER[state]}`}
        style={{
          color: state === "blocked" ? "var(--c-danger)" : policy.accentColor,
        }}
      >
        {icon}
      </span>
    </Tooltip>
  );
}

/**
 * The canonical policy badge row: one accent-tinted category icon per policy
 * that has run on a file, spinning while a run is in flight. Every surface that
 * shows per-file policy badges (file sidebar, file editor thumbnails, files
 * page) renders this so they stay identical.
 */
export function PolicyBadges({
  policies,
  className,
}: {
  policies: FileItemPolicyRef[];
  /** Appended to the row for surface-specific layout (spacing only). */
  className?: string;
}) {
  if (policies.length === 0) return null;
  return (
    <span
      className={`policy-badges${className ? ` ${className}` : ""}`}
      data-no-select
    >
      {policies.slice(0, MAX_VISIBLE).map((policy) => (
        <PolicyBadge key={policy.id} policy={policy} />
      ))}
    </span>
  );
}
