import React, { useState, useEffect } from 'react';
import { Menu, Button, ActionIcon } from '@mantine/core';
import { Tooltip } from '@app/components/shared/Tooltip';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '@app/i18n';
import LocalIcon from '@app/components/shared/LocalIcon';
import styles from '@app/components/shared/LanguageSelector.module.css';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from '@app/styles/zIndex';

// Types
interface LanguageSelectorProps {
  position?: React.ComponentProps<typeof Menu>['position'];
  offset?: number;
  compact?: boolean; // icon-only trigger
  tooltip?: string; // tooltip text for compact mode
}

interface LanguageOption {
  value: string;
  label: string;
}

interface RippleEffect {
  x: number;
  y: number;
  key: number;
}

// Sub-components
interface LanguageItemProps {
  option: LanguageOption;
  index: number;
  animationTriggered: boolean;
  isSelected: boolean;
  onClick: (event: React.MouseEvent) => void;
  rippleEffect?: RippleEffect | null;
  pendingLanguage: string | null;
  compact: boolean;
  disabled?: boolean;
}

const LanguageItem: React.FC<LanguageItemProps> = ({
  option,
  index,
  animationTriggered,
  isSelected,
  onClick,
  rippleEffect,
  pendingLanguage,
  compact,
  disabled = false
}) => {
  const { t } = useTranslation();

  const label = disabled ? (
    <Tooltip content={t('comingSoon', 'Coming soon')} position="left" arrow>
      <p>{option.label}</p>
    </Tooltip>
  ) : (
    <p>{option.label}</p>
  );

  return (
    <div
      className={styles.languageItem}
      style={{
        opacity: animationTriggered ? 1 : 0,
        transform: animationTriggered ? 'translateY(0px)' : 'translateY(8px)',
        transition: `opacity 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${index * 0.01}s, transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${index * 0.01}s`,
      }}
    >
      <Button
        variant="subtle"
        size="sm"
        fullWidth
        onClick={disabled ? undefined : onClick}
        data-selected={isSelected}
        disabled={disabled}
        styles={{
          root: {
            borderRadius: '4px',
            minHeight: '32px',
            padding: '4px 8px',
            justifyContent: 'flex-start',
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: isSelected
              ? 'light-dark(var(--mantine-color-blue-1), var(--mantine-color-blue-8))'
              : 'transparent',
            color: disabled
              ? 'light-dark(var(--mantine-color-gray-5), var(--mantine-color-dark-3))'
              : isSelected
              ? 'light-dark(var(--mantine-color-blue-9), var(--mantine-color-white))'
              : 'light-dark(var(--mantine-color-gray-7), var(--mantine-color-white))',
            transition: 'all 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            '&:hover': !disabled ? {
              backgroundColor: isSelected
                ? 'light-dark(var(--mantine-color-blue-2), var(--mantine-color-blue-7))'
                : 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))',
              transform: 'translateY(-1px)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            } : {}
          },
          label: {
            fontSize: '13px',
            fontWeight: isSelected ? 600 : 400,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            position: 'relative',
            zIndex: 2,
          }
        }}
      >
        {label}
        {!compact && rippleEffect && pendingLanguage === option.value && (
          <div
            key={rippleEffect.key}
            style={{
              position: 'absolute',
              left: rippleEffect.x,
              top: rippleEffect.y,
              width: 0,
              height: 0,
              borderRadius: '50%',
              backgroundColor: 'var(--mantine-color-blue-4)',
              opacity: 0.6,
              transform: 'translate(-50%, -50%)',
              animation: 'ripple-expand 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              zIndex: 1,
            }}
          />
        )}
      </Button>
    </div>
  );
};

const RippleStyles: React.FC = () => (
  <style>
    {`
      @keyframes ripple-expand {
        0% { width: 0; height: 0; opacity: 0.6; }
        50% { opacity: 0.3; }
        100% { width: 100px; height: 100px; opacity: 0; }
      }
    `}
  </style>
);

// Main component
const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  position = 'bottom-start',
  offset = 8,
  compact = false,
  tooltip
}) => {
  const { i18n } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [animationTriggered, setAnimationTriggered] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [rippleEffect, setRippleEffect] = useState<RippleEffect | null>(null);

  const languageOptions: LanguageOption[] = Object.entries(supportedLanguages)
    .sort(([, nameA], [, nameB]) => nameA.localeCompare(nameB))
    .map(([code, name]) => ({
      value: code,
      label: name,
    }));

  const handleLanguageChange = (value: string, event: React.MouseEvent) => {
    // Create ripple effect at click position (only for button mode)
    if (!compact) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setRippleEffect({ x, y, key: Date.now() });
    }

    // Start transition animation
    setPendingLanguage(value);

    // Simulate processing time for smooth transition
    setTimeout(() => {
      i18n.changeLanguage(value);

      setTimeout(() => {
        setPendingLanguage(null);
        setOpened(false);

        // Clear ripple effect
        setTimeout(() => setRippleEffect(null), 50);

        // Force a full reload so RTL/LTR layout and tooltips re-evaluate correctly
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }, 150);
    }, 100);
  };

  const currentLanguage = supportedLanguages[i18n.language as keyof typeof supportedLanguages] ||
                         supportedLanguages['en-GB'];

  // Trigger animation when dropdown opens
  useEffect(() => {
    if (opened) {
      setAnimationTriggered(false);
      // Small delay to ensure DOM is ready
      setTimeout(() => setAnimationTriggered(true), 20);
    }
  }, [opened]);

  return (
    <>
      <RippleStyles />
      <Menu
        opened={opened}
        onChange={setOpened}
        width={600}
        position={position}
        offset={offset}
        zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
        transitionProps={{
          transition: 'scale-y',
          duration: 120,
          timingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}
      >
        <Menu.Target>
          {compact ? (
            <ActionIcon
              variant="subtle"
              radius="md"
              className="right-rail-icon"
              title={!opened && tooltip ? tooltip : undefined}
              styles={{
                root: {
                  color: 'var(--right-rail-icon)',
                  '&:hover': {
                    backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))',
                  }
                }
              }}
            >
              <LocalIcon icon="language" width="1.5rem" height="1.5rem" />
            </ActionIcon>
          ) : (
            <Button
              variant="subtle"
              size="sm"
              leftSection={<LocalIcon icon="language" width="1.5rem" height="1.5rem" />}
              styles={{
                root: {
                  border: 'none',
                  color: 'light-dark(var(--mantine-color-gray-7), var(--mantine-color-gray-1))',
                  transition: 'background-color 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  '&:hover': {
                    backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))',
                  }
                },
                label: { fontSize: '12px', fontWeight: 500 }
              }}
            >
              <span className={styles.languageText}>
                {currentLanguage}
              </span>
            </Button>
          )}
        </Menu.Target>

        <Menu.Dropdown
          style={{
            padding: '12px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            backgroundColor: 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))',
            border: 'light-dark(1px solid var(--mantine-color-gray-3), 1px solid var(--mantine-color-dark-4))',
            zIndex: Z_INDEX_OVER_FULLSCREEN_SURFACE,
          }}
        >
          <div className={styles.languageGrid}>
              {languageOptions.map((option, index) => {
                const enabledLanguages = [
                  'en-GB', 'zh-CN', 'zh-TW', 'ar-AR', 'fa-IR', 'tr-TR', 'uk-UA', 'zh-BO', 'sl-SI',
                  'ru-RU', 'ja-JP', 'ko-KR', 'hu-HU', 'ga-IE', 'bg-BG', 'es-ES', 'hi-IN', 'hr-HR',
                  'el-GR', 'ml-ML', 'pt-BR', 'pl-PL', 'pt-PT', 'sk-SK', 'sr-LATN-RS', 'no-NB',
                  'th-TH', 'vi-VN', 'az-AZ', 'eu-ES', 'de-DE', 'sv-SE', 'it-IT', 'ca-CA', 'id-ID',
                  'ro-RO', 'fr-FR', 'nl-NL', 'da-DK', 'cs-CZ'
                ];
                const isDisabled = !enabledLanguages.includes(option.value);

                return (
                  <LanguageItem
                    key={option.value}
                    option={option}
                    index={index}
                    animationTriggered={animationTriggered}
                    isSelected={option.value === i18n.language}
                    onClick={(event) => handleLanguageChange(option.value, event)}
                    rippleEffect={rippleEffect}
                    pendingLanguage={pendingLanguage}
                    compact={compact}
                    disabled={isDisabled}
                  />
                );
              })}
          </div>
        </Menu.Dropdown>
      </Menu>
    </>
  );
};

export default LanguageSelector;
export type { LanguageSelectorProps, LanguageOption, RippleEffect };
