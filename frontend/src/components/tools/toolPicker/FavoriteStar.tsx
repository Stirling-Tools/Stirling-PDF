import React from "react";
import { ActionIcon } from "@mantine/core";
import type { MantineSize } from "@mantine/core";
import { useTranslation } from "react-i18next";
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';

interface FavoriteStarProps {
  isFavorite: boolean;
  onToggle: () => void;
  className?: string;
  size?: MantineSize;
}

const FavoriteStar: React.FC<FavoriteStarProps> = ({ isFavorite, onToggle, className, size = "xs" }) => {
  const { t } = useTranslation();

  return (
    <ActionIcon
      component="span"
      variant="subtle"
      radius="xl"
      size={size}
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
      aria-label={isFavorite ? t('toolPanel.fullscreen.unfavorite', 'Remove from favourites') : t('toolPanel.fullscreen.favorite', 'Add to favourites')}
    >
      {isFavorite ? (
        <StarRoundedIcon fontSize="inherit" style={{ color: 'var(--special-color-favorites)', fontSize: '1rem' }} />
      ) : (
        <StarBorderRoundedIcon fontSize="inherit" style={{ fontSize: '1rem' }} />
      )}
    </ActionIcon>
  );
};

export default FavoriteStar;


