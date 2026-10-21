import { useTranslation } from "react-i18next";
import {
  Badge,
  Group,
  Loader,
  Progress,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
} from "@mantine/core";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { ViewerReadAloudState } from "@app/components/viewer/useViewerReadAloud";
import {
  languageDisplayName,
  voiceDisplayName,
} from "@app/services/readAloud/voices";
import "@app/components/viewer/readAloud/ReadAloudPlayer.css";

interface ReadAloudPlayerProps {
  readAloud: ViewerReadAloudState;
}

export function ReadAloudPlayer({ readAloud }: ReadAloudPlayerProps) {
  const { t, i18n } = useTranslation();
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
  } = readAloud;

  const detected = detection?.detection.language ?? null;
  const detectedName = detected
    ? languageDisplayName(detected, i18n.language)
    : null;
  const uncertain =
    detection?.detection.assumed || detection?.detection.lowText || false;
  const isPlaying = playback === "playing";
  const isActive = isPlaying || playback === "paused";
  const isFinished = playback === "finished";
  const hasText = chunkCount > 0;
  const hasVoice = Boolean(voice);

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

  const progress = (() => {
    if (isFinished) return 100;
    if (totalPages <= 0) return 0;
    const chunks = Math.max(chunkCount, 1);
    const value =
      (currentPage - 1 + (isActive ? chunkIndex / chunks : 0)) / totalPages;
    return Math.min(100, Math.max(0, value * 100));
  })();

  const pageLabel =
    totalPages > 0
      ? t("readAloud.pageOf", "Page {{current}} of {{total}}", {
          current: currentPage,
          total: totalPages,
        })
      : t("readAloud.ready", "Ready to read");

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

  return (
    <Stack gap="sm" className="read-aloud-player">
      <Badge
        size="sm"
        variant="light"
        className="read-aloud-player__badge"
        title={statusLabel}
        aria-live="polite"
      >
        {detectionStatus === "detecting" ? (
          <Loader size={10} color="currentColor" />
        ) : null}
        {statusLabel}
      </Badge>

      <div className="read-aloud-player__meta" role="status" aria-live="polite">
        <Text size="xs" c="dimmed">
          {pageLabel}
        </Text>
        {hasText && isActive ? (
          <Text size="xs" c="dimmed">
            {t(
              "readAloud.sentenceProgress",
              "Sentence {{current}} of {{total}}",
              {
                current: chunkIndex + 1,
                total: chunkCount,
              },
            )}
          </Text>
        ) : null}
      </div>

      <Progress
        value={progress}
        size="xs"
        radius="xl"
        aria-label={t("readAloud.progress", "Reading progress")}
        aria-valuetext={pageLabel}
        className="read-aloud-player__progress"
      />

      <Group justify="center" gap="sm" className="read-aloud-player__transport">
        <Tooltip
          content={t("readAloud.previous", "Previous sentence")}
          position="top"
          delay={0}
        >
          <ActionIcon
            variant="tertiary"
            size="lg"
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
          openOnFocus={false}
        >
          <ActionIcon
            variant="primary"
            size="xl"
            shape="circle"
            aria-label={
              isPlaying
                ? t("readAloud.pause", "Pause")
                : t("readAloud.play", "Play")
            }
            onClick={() => void togglePlayPause()}
            disabled={!hasVoice && detectionStatus !== "detecting"}
            data-autofocus
            className="read-aloud-player__play"
          >
            <Icon name={isPlaying ? "pause" : "play"} size="1.25rem" />
          </ActionIcon>
        </Tooltip>

        <Tooltip
          content={t("readAloud.next", "Next sentence")}
          position="top"
          delay={0}
        >
          <ActionIcon
            variant="tertiary"
            size="lg"
            aria-label={t("readAloud.next", "Next sentence")}
            onClick={next}
            disabled={!isActive}
          >
            <Icon name="chevron-right" size="1.15rem" />
          </ActionIcon>
        </Tooltip>

        <Tooltip content={t("readAloud.stop", "Stop")} position="top" delay={0}>
          <ActionIcon
            variant="tertiary"
            size="lg"
            aria-label={t("readAloud.stop", "Stop")}
            onClick={stop}
            disabled={!isActive && !isFinished}
          >
            <Icon name="square" size="0.9rem" />
          </ActionIcon>
        </Tooltip>
      </Group>

      {errorMessage ? (
        <div className="read-aloud-player__warning" role="alert">
          <Icon name="triangle-alert" size="1rem" />
          <Text size="xs">{errorMessage}</Text>
        </div>
      ) : null}

      {!hasVoice && !errorMessage && detectionStatus !== "detecting" ? (
        <div className="read-aloud-player__warning" role="alert">
          <Icon name="triangle-alert" size="1rem" />
          <Text size="xs">
            {t(
              "readAloud.error.noVoice",
              "No voice is installed for {{language}}. Pick another language or install a voice in your system settings.",
              { language: languageDisplayName(language, i18n.language) },
            )}
          </Text>
        </div>
      ) : null}

      <div className="read-aloud-player__section">
        <div className="read-aloud-player__row">
          <Text size="xs" fw={500}>
            {t("readAloud.speed", "Speed")}
          </Text>
          <Text size="xs" c="dimmed" className="read-aloud-player__value">
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
          size="sm"
          aria-label={t("readAloud.speed", "Speed")}
        />
      </div>

      <div className="read-aloud-player__selects">
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
      </div>

      <Switch
        size="xs"
        label={t("readAloud.highlight", "Highlight the word being read")}
        checked={highlightEnabled}
        onChange={(event) => setHighlightEnabled(event.currentTarget.checked)}
        className="read-aloud-player__switch"
      />
    </Stack>
  );
}
