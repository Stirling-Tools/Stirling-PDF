import { Tooltip } from "@mantine/core";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import AutorenewIcon from "@mui/icons-material/Autorenew";
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
}

const MAX_VISIBLE = 3;

/**
 * The canonical policy badge row: one accent-tinted shield per policy that has
 * run on a file, spinning while a run is in flight, glowing briefly after it
 * lands. Every surface that shows per-file policy badges (file sidebar, file
 * editor thumbnails, files page) renders this so they stay identical.
 */
export function PolicyBadges({
  policies,
  className,
}: {
  policies: FileItemPolicyRef[];
  /** Appended to the row for surface-specific layout (spacing only). */
  className?: string;
}) {
  const { t } = useTranslation();
  if (policies.length === 0) return null;
  return (
    <span
      className={`policy-badges${className ? ` ${className}` : ""}`}
      data-no-select
    >
      {policies.slice(0, MAX_VISIBLE).map((policy) => (
        <Tooltip
          key={policy.id}
          label={
            policy.enforcing
              ? t("policy.badgeEnforcing", "{{name}} enforcing…", {
                  name: policy.name,
                })
              : t("policy.badgeRan", "{{name}} policy ran on this file", {
                  name: policy.name,
                })
          }
          withArrow
          position="top"
        >
          <span
            className={`policy-badge${policy.enforcing ? " policy-badge--enforcing" : ""}${policy.recent && !policy.enforcing ? " policy-badge--recent" : ""}`}
            style={{ color: policy.accentColor }}
          >
            {policy.enforcing ? (
              <AutorenewIcon sx={{ fontSize: "0.7rem" }} />
            ) : (
              <ShieldOutlinedIcon sx={{ fontSize: "0.7rem" }} />
            )}
          </span>
        </Tooltip>
      ))}
    </span>
  );
}
