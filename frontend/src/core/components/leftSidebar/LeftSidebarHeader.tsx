import { useTranslation } from 'react-i18next';
import { useMantineColorScheme } from '@mantine/core';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import { useLogoAssets } from '@app/hooks/useLogoAssets';
import { useAppConfig } from '@app/contexts/AppConfigContext';

interface LeftSidebarHeaderProps {
  onMenuClick?: () => void;
  collapsed?: boolean;
}

export function LeftSidebarHeader({ onMenuClick, collapsed }: LeftSidebarHeaderProps) {
  const { t } = useTranslation();
  const { colorScheme } = useMantineColorScheme();
  const { config } = useAppConfig();
  const { wordmark } = useLogoAssets();
  const wordmarkSrc = colorScheme === 'dark' ? wordmark.white : wordmark.black;
  const appName = config?.appNameNavbar || 'Stirling PDF';

  return (
    <div className="left-sidebar-header">
      <button
        type="button"
        className="left-sidebar-header-menu-btn"
        aria-label={t('leftSidebar.menu', 'Menu')}
        onClick={onMenuClick}
      >
        <MenuRoundedIcon sx={{ fontSize: '1.25rem' }} />
      </button>
      {!collapsed && (
        <img src={wordmarkSrc} alt={appName} className="left-sidebar-header-wordmark" />
      )}
    </div>
  );
}
