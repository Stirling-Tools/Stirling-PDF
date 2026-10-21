import { useTranslation } from "react-i18next";
import { Group, Progress, Text } from "@mantine/core";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { ViewerReadAloudState } from "@app/components/viewer/useViewerReadAloud";

interface ReadAloudMiniPlayerProps {
  readAloud: ViewerReadAloudState;
  /** Other sidebars currently occupy this many rem at the right edge. */
  rightOffset: number;
  onExpand: () => void;
  onClose: () => void;
}

export function ReadAloudMiniPlayer({
  readAloud,
  rightOffset,
  onExpand,
  onClose,
}: ReadAloudMiniPlayerProps) {
  const { t } = useTranslation();
  const { playback, currentPage, totalPages, chunkIndex, chunkCount } =
    readAloud;
  const isPlaying = playback === "playing";
  const isActive = isPlaying || playback === "paused";
  const pageLabel =
    totalPages > 0
      ? t("readAloud.pageOf", "Page {{current}} of {{total}}", {
          current: currentPage,
          total: totalPages,
        })
      : t("readAloud.ready", "Ready to read");
  const progress =
    playback === "finished"
      ? 100
      : totalPages > 0
        ? Math.min(
            100,
            Math.max(
              0,
              ((currentPage -
                1 +
                (isActive ? chunkIndex / Math.max(chunkCount, 1) : 0)) /
                totalPages) *
                100,
            ),
          )
        : 0;

  return (
    <div
      className="read-aloud-mini"
      style={{ right: `${rightOffset + 0.75}rem` }}
      role="region"
      aria-label={t("readAloud.title", "Read aloud")}
    >
      <Group gap="xs" wrap="nowrap" align="center">
        <div className="read-aloud-mini__text">
          <Text size="sm" fw={600} lineClamp={1}>
            {t("readAloud.title", "Read aloud")}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {pageLabel}
          </Text>
        </div>
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
            size="md"
            shape="circle"
            aria-label={
              isPlaying
                ? t("readAloud.pause", "Pause")
                : t("readAloud.play", "Play")
            }
            onClick={() => void readAloud.togglePlayPause()}
          >
            <Icon name={isPlaying ? "pause" : "play"} size="1rem" />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          content={t("readAloud.expand", "Show controls")}
          position="top"
          delay={0}
        >
          <ActionIcon
            variant="tertiary"
            size="sm"
            aria-label={t("readAloud.expand", "Show controls")}
            onClick={onExpand}
          >
            <Icon name="chevron-left" size="1rem" />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          content={t("readAloud.close", "Close read aloud")}
          position="top"
          delay={0}
        >
          <ActionIcon
            variant="tertiary"
            size="sm"
            aria-label={t("readAloud.close", "Close read aloud")}
            onClick={onClose}
          >
            <Icon name="x" size="1rem" />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Progress
        value={progress}
        size={4}
        radius="xl"
        mt={6}
        aria-label={t("readAloud.progress", "Reading progress")}
        aria-valuetext={pageLabel}
      />
    </div>
  );
}
