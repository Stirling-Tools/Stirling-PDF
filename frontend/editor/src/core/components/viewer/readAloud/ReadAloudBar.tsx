import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  Group,
  Popover,
  Progress,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
} from "@mantine/core";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { ReadAloudStore } from "@app/components/viewer/useViewerReadAloud";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  languageDisplayName,
  voiceDisplayName,
} from "@app/services/readAloud/voices";
import "@app/components/viewer/readAloud/ReadAloudBar.css";

interface ReadAloudBarProps {
  store: ReadAloudStore;
}

export function ReadAloudBar({ store }: ReadAloudBarProps) {
  const { t, i18n } = useTranslation();
  const { setReaderMode } = useToolWorkflow();
  const readAloud = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [optionsOpen, setOptionsOpen] = useState(false);

  if (!readAloud.panelOpen) return null;

  const {
    playback,
    detection,
    detectionStatus,
    language,
    languageSource,
    voice,
    selectedVoiceURI,
    languageOptions,
    voiceOptions,
    speechRate,
    highlightEnabled,
    currentPage,
    totalPages,
    chunkIndex,
    chunkCount,
    error,
    togglePlayPause,
    stop,
    previous,
    next,
    setRate,
    setVoice,
    setLanguage,
    setHighlightEnabled,
    redetect,
  } = readAloud;

  const isPlaying = playback === "playing";
  const isActive = isPlaying || playback === "paused";
  const isFinished = playback === "finished";
  const hasText = chunkCount > 0;
  const hasVoice = Boolean(voice);

  const detected = detection?.detection.language ?? null;
  const detectedName = detected
    ? languageDisplayName(detected, i18n.language)
    : null;
  const uncertain =
    detection?.detection.assumed || detection?.detection.lowText || false;

  const statusLabel = (() => {
    if (detectionStatus === "detecting") {
      return t("readAloud.detecting", "Detecting document language…");
    }
    if (languageSource === "manual") {
      return t("readAloud.manualLanguage", "Using {{language}}", {
        language: languageDisplayName(language, i18n.language),
      });
    }
    if (detectedName && detected) {
      return uncertain
        ? t("readAloud.likelyLanguage", "Likely {{language}}", {
            language: detectedName,
          })
        : t("readAloud.detectedLanguage", "Detected {{language}}", {
            language: detectedName,
          });
    }
    return t("readAloud.fallbackLanguage", "Using {{language}}", {
      language: languageDisplayName(language, i18n.language),
    });
  })();

  const pageLabel =
    totalPages > 0
      ? t("readAloud.pageOf", "Page {{current}} of {{total}}", {
          current: currentPage,
          total: totalPages,
        })
      : t("readAloud.ready", "Ready to read");

  const progress = (() => {
    if (isFinished) return 100;
    if (totalPages <= 0) return 0;
    const chunks = Math.max(chunkCount, 1);
    const value =
      (currentPage - 1 + (isActive ? chunkIndex / chunks : 0)) / totalPages;
    return Math.min(100, Math.max(0, value * 100));
  })();

  const errorMessage = (() => {
    switch (error) {
      case "noSpeech":
        return t(
          "readAloud.error.noSpeech",
          "Read aloud is not available in this browser.",
        );
      case "noText":
        return t(
          "readAloud.error.noText",
          "This page has no text to read. If it is a scan, run OCR first.",
        );
      case "detectionFailed":
        return t(
          "readAloud.error.detectionFailed",
          "The document language could not be detected. Pick one below.",
        );
      case "playbackFailed":
        return t(
          "readAloud.error.playbackFailed",
          "Playback stopped unexpectedly. Try again.",
        );
      default:
        return null;
    }
  })();

  const close = () => {
    stop();
    readAloud.closePanel();
  };

  return (
    <div
      className="read-aloud-bar"
      role="region"
      aria-label={t("readAloud.title", "Read aloud")}
    >
      <Group gap="xs" wrap="nowrap" className="read-aloud-bar__row">
        <Icon name="volume-2" size="1.1rem" className="read-aloud-bar__brand" />

        <Tooltip
          content={t("readAloud.previous", "Previous sentence")}
          position="top"
          delay={0}
        >
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            size="md"
            aria-label={t("readAloud.previous", "Previous sentence")}
            onClick={previous}
            disabled={!isActive}
          >
            <Icon name="chevron-left" size="1.15rem" />
          </ActionIcon>
        </Tooltip>

        <Tooltip
          content={
            isPlaying
              ? t("readAloud.pause", "Pause")
              : t("readAloud.play", "Play")
          }
          position="top"
          delay={0}
        >
          <ActionIcon
            variant="primary"
            size="lg"
            shape="circle"
            aria-label={
              isPlaying
                ? t("readAloud.pause", "Pause")
                : t("readAloud.play", "Play")
            }
            onClick={() => void togglePlayPause()}
            disabled={!hasVoice && detectionStatus !== "detecting"}
          >
            <Icon name={isPlaying ? "pause" : "play"} size="1.1rem" />
          </ActionIcon>
        </Tooltip>

        <Tooltip
          content={t("readAloud.next", "Next sentence")}
          position="top"
          delay={0}
        >
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            size="md"
            aria-label={t("readAloud.next", "Next sentence")}
            onClick={next}
            disabled={!isActive}
          >
            <Icon name="chevron-right" size="1.15rem" />
          </ActionIcon>
        </Tooltip>

        <div
          className="read-aloud-bar__status"
          role="status"
          aria-live="polite"
        >
          <Text size="sm" fw={600} lineClamp={1}>
            {pageLabel}
            {hasText && isActive
              ? ` · ${t(
                  "readAloud.sentenceProgress",
                  "Sentence {{current}} of {{total}}",
                  {
                    current: chunkIndex + 1,
                    total: chunkCount,
                  },
                )}`
              : null}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={1} title={statusLabel}>
            {statusLabel}
          </Text>
        </div>

        <Popover
          opened={optionsOpen}
          onChange={setOptionsOpen}
          position="top"
          offset={8}
          withArrow
          shadow="md"
          width={280}
          withinPortal
        >
          <Popover.Target>
            <Button
              variant="secondary"
              size="sm"
              leftSection={<Icon name="sliders-horizontal" size="1rem" />}
              onClick={() => setOptionsOpen((open) => !open)}
              aria-expanded={optionsOpen}
            >
              {t("readAloud.voiceOptions", "Voice options")}
            </Button>
          </Popover.Target>
          <Popover.Dropdown p="sm">
            <Stack gap="sm">
              <Select
                label={t("readAloud.language", "Language")}
                value={language}
                onChange={(value) => {
                  if (value) setLanguage(value);
                }}
                data={languageOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                placeholder={t("readAloud.chooseLanguage", "Choose a language")}
                searchable
                allowDeselect={false}
                size="xs"
                comboboxProps={{ withinPortal: true }}
                disabled={languageOptions.length === 0}
              />
              <Select
                label={t("readAloud.voice", "Voice")}
                value={
                  voiceOptions.length > 0 && selectedVoiceURI
                    ? selectedVoiceURI
                    : null
                }
                onChange={(value) => {
                  if (value) setVoice(value);
                }}
                data={voiceOptions.map((item) => ({
                  value: item.voiceURI,
                  label: voiceDisplayName(item),
                }))}
                placeholder={t("readAloud.chooseVoice", "Choose a voice")}
                searchable
                allowDeselect={false}
                size="xs"
                comboboxProps={{ withinPortal: true }}
                disabled={voiceOptions.length === 0}
              />
              <div className="read-aloud-bar__section">
                <div className="read-aloud-bar__row-label">
                  <Text size="xs" fw={500}>
                    {t("readAloud.speed", "Speed")}
                  </Text>
                  <Text size="xs" c="dimmed" className="read-aloud-bar__value">
                    {speechRate.toFixed(1)}×
                  </Text>
                </div>
                <Slider
                  value={speechRate}
                  onChange={(value) => setRate(value)}
                  onChangeEnd={(value) => setRate(value, true)}
                  min={0.5}
                  max={2}
                  step={0.1}
                  label={(value) => `${value.toFixed(1)}×`}
                  size="xs"
                  aria-label={t("readAloud.speed", "Speed")}
                />
              </div>
              <Switch
                size="xs"
                label={t(
                  "readAloud.highlight",
                  "Highlight the word being read",
                )}
                checked={highlightEnabled}
                onChange={(event) =>
                  setHighlightEnabled(event.currentTarget.checked)
                }
              />
              <Group justify="space-between" gap="xs">
                <Tooltip
                  content={t("readAloud.detectAgain", "Detect language again")}
                  position="top"
                  delay={0}
                >
                  <ActionIcon
                    variant="tertiary"
                    accent="neutral"
                    size="sm"
                    aria-label={t(
                      "readAloud.detectAgain",
                      "Detect language again",
                    )}
                    onClick={() => void redetect()}
                    disabled={detectionStatus === "detecting"}
                  >
                    <Icon name="refresh-cw" size="0.9rem" />
                  </ActionIcon>
                </Tooltip>
                <Button
                  variant="quiet"
                  accent="neutral"
                  size="sm"
                  leftSection={<Icon name="book-open" size="0.9rem" />}
                  onClick={() => setReaderMode(true)}
                >
                  {t("readAloud.readMode", "Read mode")}
                </Button>
              </Group>
            </Stack>
          </Popover.Dropdown>
        </Popover>

        <Tooltip
          content={t("readAloud.readMode", "Read mode")}
          position="top"
          delay={0}
        >
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            size="md"
            className="read-aloud-bar__read-mode"
            aria-label={t("readAloud.readMode", "Read mode")}
            onClick={() => setReaderMode(true)}
          >
            <Icon name="book-open" size="1rem" />
          </ActionIcon>
        </Tooltip>

        <Tooltip
          content={t("readAloud.close", "Close read aloud")}
          position="top"
          delay={0}
        >
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            size="md"
            aria-label={t("readAloud.close", "Close read aloud")}
            onClick={close}
          >
            <Icon name="x" size="1rem" />
          </ActionIcon>
        </Tooltip>
      </Group>

      {errorMessage ? (
        <div className="read-aloud-bar__warning" role="alert">
          <Icon name="triangle-alert" size="0.9rem" />
          <Text size="xs">{errorMessage}</Text>
        </div>
      ) : !hasVoice && detectionStatus !== "detecting" ? (
        <div className="read-aloud-bar__warning" role="alert">
          <Icon name="triangle-alert" size="0.9rem" />
          <Text size="xs">
            {t(
              "readAloud.error.noVoice",
              "No voice is installed for {{language}}. Pick another language or install a voice in your system settings.",
              { language: languageDisplayName(language, i18n.language) },
            )}
          </Text>
        </div>
      ) : null}

      <Progress
        value={progress}
        size={3}
        radius="xl"
        mt={6}
        aria-label={t("readAloud.progress", "Reading progress")}
        aria-valuetext={pageLabel}
      />
    </div>
  );
}
