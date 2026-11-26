import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text, TextInput, Group } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import { ToolInfoTooltip } from "@editor/components/tools/shared/ToolInfoTooltip";

interface WordsToRedactInputProps {
  wordsToRedact: string[];
  onAddWord: (word: string) => void;
  onRemoveWord: (index: number) => void;
  disabled?: boolean;
}

export default function WordsToRedactInput({
  wordsToRedact,
  onAddWord,
  onRemoveWord,
  disabled,
}: WordsToRedactInputProps) {
  const { t } = useTranslation();
  const [currentWord, setCurrentWord] = useState("");

  const addWord = () => {
    if (currentWord.trim() && !wordsToRedact.includes(currentWord.trim())) {
      onAddWord(currentWord.trim());
      setCurrentWord("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWord();
    }
  };

  return (
    <Stack gap="sm">
      <Group gap={4} wrap="nowrap">
        <Text size="sm" fw={500}>
          {t("redact.auto.wordsToRedact.title", "Words to Redact")}
        </Text>
        <ToolInfoTooltip
          label={t(
            "redact.auto.wordsToRedact.info",
            "Each word or phrase is found and redacted on its own, for example Confidential or Top-Secret.",
          )}
        />
      </Group>

      {/* Current words */}
      {wordsToRedact.map((word, index) => (
        <Group
          key={index}
          justify="space-between"
          p="sm"
          style={{
            borderRadius: "var(--mantine-radius-sm)",
            border: "1px solid var(--c-border)",
            backgroundColor: "var(--c-input-bg)",
          }}
        >
          <Text
            size="sm"
            style={{
              maxWidth: "80%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={word}
            className={privateContentClassName}
          >
            {word}
          </Text>
          <ActionIcon
            size="sm"
            variant="tertiary"
            accent="danger"
            onClick={() => onRemoveWord(index)}
            disabled={disabled}
            aria-label={t("remove", "Remove")}
          >
            ×
          </ActionIcon>
        </Group>
      ))}

      {/* Add new word input */}
      <Group gap="sm" align="end">
        <TextInput
          placeholder={t(
            "redact.auto.wordsToRedact.placeholder",
            "Enter a word",
          )}
          value={currentWord}
          className={privateContentClassName}
          onChange={(e) => setCurrentWord(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={disabled}
          size="sm"
          style={{ flex: 1 }}
        />
        <Button
          size="md"
          fontSize="sm"
          variant="secondary"
          onClick={addWord}
          disabled={disabled || !currentWord.trim()}
        >
          + {t("redact.auto.wordsToRedact.add", "Add")}
        </Button>
      </Group>
    </Stack>
  );
}
