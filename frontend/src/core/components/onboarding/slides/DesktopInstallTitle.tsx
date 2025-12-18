import React from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, ActionIcon } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';

export interface OSOption {
  label: string;
  url: string;
  value: string;
}

interface DesktopInstallTitleProps {
  osLabel: string;
  osUrl: string;
  osOptions: OSOption[];
  onDownloadUrlChange?: (url: string) => void;
}

export const DesktopInstallTitle: React.FC<DesktopInstallTitleProps> = ({ 
  osLabel, 
  osUrl, 
  osOptions, 
  onDownloadUrlChange 
}) => {
  const { t } = useTranslation();
  const [selectedOsUrl, setSelectedOsUrl] = React.useState<string>(osUrl);

  React.useEffect(() => {
    setSelectedOsUrl(osUrl);
  }, [osUrl]);

  const handleOsSelect = React.useCallback((option: OSOption) => {
    setSelectedOsUrl(option.url);
    onDownloadUrlChange?.(option.url);
  }, [onDownloadUrlChange]);

  const currentOsOption = osOptions.find(opt => opt.url === selectedOsUrl) || 
    (osOptions.length > 0 ? osOptions[0] : { label: osLabel, url: osUrl });
  
  const displayLabel = currentOsOption.label || osLabel;
  const title = displayLabel 
    ? t('onboarding.desktopInstall.titleWithOs', 'Download for {{osLabel}}', { osLabel: displayLabel })
    : t('onboarding.desktopInstall.title', 'Download');

  // If only one option or no options, don't show dropdown
  if (osOptions.length <= 1) {
    return <div style={{ textAlign: 'center', width: '100%' }}>{title}</div>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{title}</span>
      <Menu position="bottom" offset={5} zIndex={10000}>
        <Menu.Target>
          <ActionIcon
            variant="transparent"
            size="sm"
            style={{ 
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              padding: 0
            }}
          >
            <LocalIcon icon="expand-more-rounded" width={20} height={20} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {osOptions.map((option) => {
            const isSelected = option.url === selectedOsUrl;
            return (
              <Menu.Item
                key={option.url}
                onClick={() => handleOsSelect(option)}
                style={{
                  backgroundColor: isSelected
                    ? 'light-dark(var(--mantine-color-blue-1), var(--mantine-color-blue-8))'
                    : 'transparent',
                  color: isSelected
                    ? 'light-dark(var(--mantine-color-blue-9), var(--mantine-color-white))'
                    : 'inherit',
                }}
              >
                {option.label}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
};

