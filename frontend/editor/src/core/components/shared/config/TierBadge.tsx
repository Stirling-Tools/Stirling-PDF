import { Badge } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export interface TierBadgeProps {
  /** The licence tier this card needs. */
  tier: "PRO" | "ENTERPRISE";
}

/**
 * The licence marker on a settings card's heading. A span, because it sits
 * inside the h2 - on its own row inside the card it cost a line each.
 */
export function TierBadge({ tier }: TierBadgeProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Badge
      component="span"
      color="grape"
      size="sm"
      style={{ cursor: "pointer" }}
      onClick={() => navigate("/settings/adminPlan")}
      title={t(
        "admin.settings.badge.clickToUpgrade",
        "Click to view plan details",
      )}
    >
      {tier}
    </Badge>
  );
}
