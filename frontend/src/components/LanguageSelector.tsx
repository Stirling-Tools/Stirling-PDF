import React, { useState } from 'react';
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

  const languageOptions = Object.entries(supportedLanguages)
    .sort(([, nameA], [, nameB]) => nameA.localeCompare(nameB))
    .map(([code, name]) => ({
      value: code,
      label: name,
    }));

  const handleLanguageChange = (value: string) => {
    i18n.changeLanguage(value);
    setOpened(false);
  };

  const currentLanguage = supportedLanguages[i18n.language as keyof typeof supportedLanguages] || 
                         supportedLanguages['en-GB'];

  return (
    <Menu 
      opened={opened} 
      onChange={setOpened}
      width={600}
      position="bottom-start"
      offset={8}
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
            {languageOptions.map((option) => (
              <div
                key={option.value}
                className={styles.languageItem}
              >
                <Button
                  variant="subtle"
                  size="sm"
                  fullWidth
                  onClick={() => handleLanguageChange(option.value)}
                  styles={{
                    root: {
                      borderRadius: '4px',
                      minHeight: '32px',
                      padding: '4px 8px',
                      justifyContent: 'flex-start',
                      backgroundColor: option.value === i18n.language ? (
                        colorScheme === 'dark' ? theme.colors.blue[8] : theme.colors.blue[1]
                      ) : 'transparent',
                      color: option.value === i18n.language ? (
                        colorScheme === 'dark' ? theme.colors.blue[2] : theme.colors.blue[7]
                      ) : (
                        colorScheme === 'dark' ? theme.colors.gray[3] : theme.colors.gray[7]
                      ),
                      '&:hover': {
                        backgroundColor: option.value === i18n.language ? (
                          colorScheme === 'dark' ? theme.colors.blue[7] : theme.colors.blue[2]
                        ) : (
                          colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[1]
                        ),
                      }
                    },
                    label: {
                      fontSize: '13px',
                      fontWeight: option.value === i18n.language ? 600 : 400,
                      textAlign: 'left',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }
                  }}
                >
                  {option.label}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Menu.Dropdown>
    </Menu>
  );
};

export default LanguageSelector;