import { useTranslation } from "react-i18next";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import { Button } from "@app/ui";
import { useConnectGate } from "@portal/hooks/useConnectGate";
import { useStarListing } from "@portal/queries/store";
import { formatCount } from "@portal/components/store/storeTools";

interface StoreStarButtonProps {
  storeId: string;
  /** Null when the viewer is anonymous (renders unstarred). */
  starred: boolean | null;
  starCount: number;
  /** Adds a "Starred" label next to the count when starred. */
  withLabel?: boolean;
  /** A preview card has nothing to star yet. */
  disabled?: boolean;
}

/**
 * Star toggle with its count. An unlinked self-hosted portal is asked to connect first, since a
 * star is written to the viewer's cloud account.
 */
export function StoreStarButton({
  storeId,
  starred,
  starCount,
  withLabel = false,
  disabled = false,
}: StoreStarButtonProps) {
  const { t } = useTranslation();
  const { guard } = useConnectGate();
  const star = useStarListing();
  const isStarred = starred === true;

  const toggle = guard(() => {
    star.mutate({ storeId, starred: !isStarred });
  });

  return (
    <Button
      variant="secondary"
      accent={isStarred ? "warning" : "neutral"}
      size="sm"
      shape="pill"
      className="portal-store__star"
      aria-pressed={isStarred}
      aria-label={
        isStarred ? t("portal.store.card.unstar") : t("portal.store.card.star")
      }
      disabled={disabled}
      onClick={toggle}
      leftSection={
        isStarred ? (
          <StarRoundedIcon style={{ fontSize: "1.125rem" }} />
        ) : (
          <StarBorderRoundedIcon style={{ fontSize: "1.125rem" }} />
        )
      }
    >
      {formatCount(starCount)}
      {withLabel && isStarred ? ` ${t("portal.store.card.starred")}` : ""}
    </Button>
  );
}
