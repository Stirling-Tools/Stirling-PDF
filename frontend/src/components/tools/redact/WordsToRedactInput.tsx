import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Text, TextInput, Button, Group, ActionIcon } from '@mantine/core';

interface WordsToRedactInputProps {
  wordsToRedact: string[];
  onWordsChange: (words: string[]) => void;
  disabled?: boolean;
}

export default function WordsToRedactInput({ wordsToRedact, onWordsChange, disabled }: WordsToRedactInputProps) {
  const { t } = useTranslation();
  const [currentWord, setCurrentWord] = useState('');

  const addWord = () => {
    if (currentWord.trim() && !wordsToRedact.includes(currentWord.trim())) {
      onWordsChange([...wordsToRedact, currentWord.trim()]);
      setCurrentWord('');
    }
  };

  const removeWord = (index: number) => {
    onWordsChange(wordsToRedact.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addWord();
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={500}>
        {t('redact.auto.wordsToRedact.title', 'Words to Redact')}
      </Text>

      {/* Current words */}
      {wordsToRedact.map((word, index) => (
        <Group key={index} justify="space-between" style={{
          padding: '8px 12px',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          border: '1px solid #e9ecef'
        }}>
          <Text size="sm">{word}</Text>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            onClick={() => removeWord(index)}
            disabled={disabled}
          >
            ×
          </ActionIcon>
        </Group>
      ))}

      {/* Add new word input */}
      <Group gap="sm">
        <TextInput
          placeholder={t('redact.auto.wordsToRedact.placeholder', 'Enter a word')}
          value={currentWord}
          onChange={(e) => setCurrentWord(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={disabled}
          style={{ flex: 1 }}
          size="sm"
        />
        <Button
          size="sm"
          variant="light"
          onClick={addWord}
          disabled={disabled || !currentWord.trim()}
        >
          + {t('redact.auto.wordsToRedact.addAnother', 'Add Another')}
        </Button>
      </Group>

      {/* Examples */}
      {wordsToRedact.length === 0 && (
        <Text size="xs" c="dimmed">
          {t('redact.auto.wordsToRedact.examples', 'Examples: Confidential, Top-Secret')}
        </Text>
      )}
    </Stack>
  );
}
