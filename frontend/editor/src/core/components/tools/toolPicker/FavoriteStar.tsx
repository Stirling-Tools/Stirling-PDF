import React from "react";
import { useTranslation } from "react-i18next";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import { ActionIcon } from "@app/ui/ActionIcon";
import type { ActionIconSize } from "@app/ui/ActionIcon";
type FavoriteStarSize = "xs" | ActionIconSize;
const SIZE_MAP: Record<FavoriteStarSize, ActionIconSize> = {
  xs: "sm",
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
};
interface FavoriteStarProps {
  isFavorite: boolean;
  onToggle: () => void;
  className?: string;
  size?: FavoriteStarSize;
}

const FavoriteStar: React.FC<FavoriteStarProps> = ({
  isFavorite,
  onToggle,
  className,
  size = "sm",
}) => {
  const { t } = useTranslation();

  return (
    <ActionIcon
      // A span, not a button: this renders inside the tool row's own button in
      // the fullscreen tool lists, and a control may not nest inside a control.
      // role="button" is still required for the aria-label to be permitted.
      as="span"
      role="button"
      variant="tertiary"
      shape="circle"
      size={SIZE_MAP[size]}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle();
      }}
      onMouseDown={(e: React.MouseEvent) => {
        e.stopPropagation();
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        e.stopPropagation();
      }}
      className={className}
      aria-label={
        isFavorite
          ? t("toolPanel.fullscreen.unfavorite", "Remove from favourites")
          : t("toolPanel.fullscreen.favorite", "Add to favourites")
      }
    >
      {isFavorite ? (
        <StarRoundedIcon
          fontSize="inherit"
          style={{ color: "var(--special-color-favorites)", fontSize: "1rem" }}
        />
      ) : (
        <StarBorderRoundedIcon
          fontSize="inherit"
          style={{ fontSize: "1rem" }}
        />
      )}
    </ActionIcon>
  );
};

export default FavoriteStar;
