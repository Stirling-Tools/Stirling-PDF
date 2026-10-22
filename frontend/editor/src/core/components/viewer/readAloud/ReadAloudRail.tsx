import { useTranslation } from "react-i18next";
import { Text } from "@mantine/core";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { ViewerReadAloudState } from "@app/components/viewer/useViewerReadAloud";

interface ReadAloudRailProps {
  readAloud: ViewerReadAloudState;
  /** Other sidebars currently occupy this many rem at the right edge. */
  rightOffset: number;
  onExpand: () => void;
  onClose: () => void;
}

export function ReadAloudRail({
  readAloud,
  rightOffset,
  onExpand,
  onClose,
}: ReadAloudRailProps) {
  const { t } = useTranslation();
  const { playback, currentPage, totalPages } = readAloud;
  const isPlaying = playback === "playing";
  const pageLabel =
    totalPages > 0
      ? `${currentPage}/${totalPages}`
      : t("readAloud.ready", "Ready");

  return (
    <div
      className="read-aloud-rail"
      style={{ right: `${rightOffset}rem` }}
      role="region"
      aria-label={t("readAloud.title", "Read aloud")}
    >
      <span className="read-aloud-rail__brand" aria-hidden="true">
        <Icon name="volume-2" size="1rem" />
      </span>
      <Tooltip
        content={
          isPlaying
            ? t("readAloud.pause", "Pause")
            : t("readAloud.play", "Play")
        }
        position="left"
        delay={0}
      >
        <ActionIcon
          variant="primary"
          size="sm"
          shape="circle"
          aria-label={
            isPlaying
              ? t("readAloud.pause", "Pause")
              : t("readAloud.play", "Play")
          }
          onClick={() => void readAloud.togglePlayPause()}
        >
          <Icon name={isPlaying ? "pause" : "play"} size="0.9rem" />
        </ActionIcon>
      </Tooltip>
      <Text size="xs" c="dimmed" className="read-aloud-rail__page">
        {pageLabel}
      </Text>
      <Tooltip
        content={t("readAloud.expand", "Show controls")}
        position="left"
        delay={0}
      >
        <ActionIcon
          variant="tertiary"
          accent="neutral"
          size="sm"
          aria-label={t("readAloud.expand", "Show controls")}
          onClick={onExpand}
        >
          <Icon name="chevron-left" size="1rem" />
        </ActionIcon>
      </Tooltip>
      <Tooltip
        content={t("readAloud.close", "Close read aloud")}
        position="left"
        delay={0}
      >
        <ActionIcon
          variant="tertiary"
          accent="neutral"
          size="sm"
          className="read-aloud-rail__close"
          aria-label={t("readAloud.close", "Close read aloud")}
          onClick={onClose}
        >
          <Icon name="x" size="1rem" />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}
