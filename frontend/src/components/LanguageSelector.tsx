import React, { useState, useEffect } from 'react';
import { Menu, Button, ScrollArea, useMantineTheme, useMantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../i18n';
import LanguageIcon from '@mui/icons-material/Language';
import styles from './LanguageSelector.module.css';

const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const [opened, setOpened] = useState(false);
  const [animationTriggered, setAnimationTriggered] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [rippleEffect, setRippleEffect] = useState<{x: number, y: number, key: number} | null>(null);

  const languageOptions = Object.entries(supportedLanguages)
    .sort(([, nameA], [, nameB]) => nameA.localeCompare(nameB))
    .map(([code, name]) => ({
      value: code,
      label: name,
    }));

  const handleLanguageChange = (value: string, event: React.MouseEvent) => {
    // Create ripple effect at click position
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    setRippleEffect({ x, y, key: Date.now() });
    
    // Start transition animation
    setIsChanging(true);
    setPendingLanguage(value);
    
    // Simulate processing time for smooth transition
    setTimeout(() => {
      i18n.changeLanguage(value);
      
      setTimeout(() => {
        setIsChanging(false);
        setPendingLanguage(null);
        setOpened(false);
        
        // Clear ripple effect
        setTimeout(() => setRippleEffect(null), 100);
      }, 300);
    }, 200);
  };

  const currentLanguage = supportedLanguages[i18n.language as keyof typeof supportedLanguages] || 
                         supportedLanguages['en-GB'];

  // Trigger animation when dropdown opens
  useEffect(() => {
    if (opened) {
      setAnimationTriggered(false);
      // Small delay to ensure DOM is ready
      setTimeout(() => setAnimationTriggered(true), 50);
    }
  }, [opened]);

  return (
    <>
      <style>
        {`
          @keyframes ripple-expand {
            0% {
              width: 0;
              height: 0;
              opacity: 0.6;
            }
            50% {
              opacity: 0.3;
            }
            100% {
              width: 100px;
              height: 100px;
              opacity: 0;
            }
          }
        `}
      </style>
      <Menu 
        opened={opened} 
        onChange={setOpened}
        width={600}
        position="bottom-start"
        offset={8}
        transitionProps={{
          transition: 'scale-y',
          duration: 200,
          timingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}
      >
      <Menu.Target>
        <Button
          variant="subtle"
          size="sm"
          leftSection={<LanguageIcon style={{ fontSize: 18 }} />}
          styles={{
            root: {
              border: 'none',
              color: colorScheme === 'dark' ? theme.colors.gray[3] : theme.colors.gray[7],
              transition: 'background-color 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              '&:hover': {
                backgroundColor: colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[1],
              }
            },
            label: {
              fontSize: '12px',
              fontWeight: 500,
            }
          }}
        >
          <span className={styles.languageText}>
            {currentLanguage}
          </span>
        </Button>
      </Menu.Target>

      <Menu.Dropdown
        style={{
          padding: '12px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          border: colorScheme === 'dark' ? `1px solid ${theme.colors.dark[4]}` : `1px solid ${theme.colors.gray[3]}`,
        }}
      >
        <ScrollArea h={190} type="scroll">
          <div className={styles.languageGrid}>
            {languageOptions.map((option, index) => (
              <div
                key={option.value}
                className={styles.languageItem}
                style={{
                  opacity: animationTriggered ? 1 : 0,
                  transform: animationTriggered ? 'translateY(0px)' : 'translateY(8px)',
                  transition: `opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${index * 0.02}s, transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${index * 0.02}s`,
                }}
              >
                <Button
                  variant="subtle"
                  size="sm"
                  fullWidth
                  onClick={(event) => handleLanguageChange(option.value, event)}
                  styles={{
                    root: {
                      borderRadius: '4px',
                      minHeight: '32px',
                      padding: '4px 8px',
                      justifyContent: 'flex-start',
                      position: 'relative',
                      overflow: 'hidden',
                      backgroundColor: option.value === i18n.language ? (
                        colorScheme === 'dark' ? theme.colors.blue[8] : theme.colors.blue[1]
                      ) : 'transparent',
                      color: option.value === i18n.language ? (
                        colorScheme === 'dark' ? theme.colors.blue[2] : theme.colors.blue[7]
                      ) : (
                        colorScheme === 'dark' ? theme.colors.gray[3] : theme.colors.gray[7]
                      ),
                      transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      '&:hover': {
                        backgroundColor: option.value === i18n.language ? (
                          colorScheme === 'dark' ? theme.colors.blue[7] : theme.colors.blue[2]
                        ) : (
                          colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[1]
                        ),
                        transform: 'translateY(-1px)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                      }
                    },
                    label: {
                      fontSize: '13px',
                      fontWeight: option.value === i18n.language ? 600 : 400,
                      textAlign: 'left',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      position: 'relative',
                      zIndex: 2,
                    }
                  }}
                >
                  {option.label}
                  
                  {/* Ripple effect */}
                  {rippleEffect && pendingLanguage === option.value && (
                    <div
                      key={rippleEffect.key}
                      style={{
                        position: 'absolute',
                        left: rippleEffect.x,
                        top: rippleEffect.y,
                        width: 0,
                        height: 0,
                        borderRadius: '50%',
                        backgroundColor: theme.colors.blue[4],
                        opacity: 0.6,
                        transform: 'translate(-50%, -50%)',
                        animation: 'ripple-expand 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                        zIndex: 1,
                      }}
                    />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Menu.Dropdown>
      </Menu>
    </>
  );
};

export default LanguageSelector;