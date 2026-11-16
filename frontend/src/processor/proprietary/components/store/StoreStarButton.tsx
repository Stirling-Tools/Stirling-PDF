import { useTranslation } from "react-i18next";
import { Button, Tooltip } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import { useConnectGate } from "@processor/hooks/useConnectGate";
import { useStarListing } from "@processor/queries/store";
import { formatCount } from "@processor/components/store/storeTools";
import {
  signInToContinue,
  useStoreAccess,
} from "@processor/components/store/storeAccess";

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
 * star is written to the viewer's cloud account; a guest is asked to sign in.
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
  const guest = useStoreAccess() === "guest";
  const isStarred = starred === true;

  const toggle = guard(() => {
    star.mutate({ storeId, starred: !isStarred });
  });

  const button = (
    <Button
      variant="secondary"
      accent={isStarred ? "warning" : "neutral"}
      size="sm"
      shape="pill"
      className="portal-store__star"
      aria-pressed={isStarred}
      aria-label={
        guest
          ? t("portal.store.guest.signInToStar")
          : isStarred
            ? t("portal.store.card.unstar")
            : t("portal.store.card.star")
      }
      disabled={disabled}
      onClick={guest ? signInToContinue : toggle}
      leftSection={
        isStarred ? (
          <Icon name="star" size="1.125rem" filled />
        ) : (
          <Icon name="star" size="1.125rem" />
        )
      }
    >
      {formatCount(starCount)}
      {withLabel && isStarred ? ` ${t("portal.store.card.starred")}` : ""}
    </Button>
  );
  return guest && !disabled ? (
    <Tooltip content={t("portal.store.guest.signInToStar")}>{button}</Tooltip>
  ) : (
    button
  );
}
