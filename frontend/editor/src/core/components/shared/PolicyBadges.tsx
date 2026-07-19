import { Tooltip } from "@mantine/core";
import AutorenewIcon from "@mui/icons-material/Autorenew";
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
}

const MAX_VISIBLE = 3;

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
  const { t } = useTranslation();
  if (policies.length === 0) return null;
  return (
    <span
      className={`policy-badges${className ? ` ${className}` : ""}`}
      data-no-select
    >
      {policies.slice(0, MAX_VISIBLE).map((policy) => {
        const running = policy.enforcing || policy.background;
        return (
          <Tooltip
            key={policy.id}
            label={
              policy.enforcing
                ? t("policy.badgeEnforcing", "{{name}} enforcing…", {
                    name: policy.name,
                  })
                : policy.background
                  ? t("policy.badgeRunning", "{{name}} running…", {
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
              className={`policy-badge${running ? " policy-badge--enforcing" : ""}`}
              style={{ color: policy.accentColor }}
            >
              {running ? (
                <AutorenewIcon sx={{ fontSize: "0.7rem" }} />
              ) : (
                policyCategoryIcon(policy.id, { fontSize: "0.7rem" })
              )}
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}
