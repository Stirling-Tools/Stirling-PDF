import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import AutoModeIcon from "@mui/icons-material/AutoMode";
import HistoryIcon from "@mui/icons-material/History";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ReplayIcon from "@mui/icons-material/Replay";
import TuneIcon from "@mui/icons-material/Tune";

import { ProcessingFolderState } from "@app/hooks/useProcessingFolders";

/**
 * The processing entries of a folder's action menu, carried by every folder kind including
 * mounts, whose other edit actions are hidden. `continuous` marks a folder whose engine
 * processes arrivals on its own, where an explicit "process now" would have nothing to do.
 */
export function ProcessingMenuItems({
  processing,
  continuous = false,
  disabled,
  disabledHint,
  onRun,
  onStop,
  onStart,
  onResume,
  onRemove,
  onEdit,
  onRevertAll,
}: {
  processing: ProcessingFolderState | undefined;
  continuous?: boolean;
  disabled: boolean;
  disabledHint?: string;
  onRun: () => void;
  onStop: () => void;
  onStart: () => void;
  onResume: () => void;
  onRemove: () => void;
  /** Open the setup dialog seeded from the existing record; absent hides Edit. */
  onEdit?: () => void;
  /** Restore every archived original in the folder; absent hides the entry. */
  onRevertAll?: () => void;
}) {
  const { t } = useTranslation();
  const heading = (
    <Menu.Label>{t("filesPage.processing.section", "Processing")}</Menu.Label>
  );
  if (!processing) {
    return (
      <>
        {heading}
        <Menu.Item
          leftSection={<AutoModeIcon fontSize="small" />}
          onClick={onStart}
          disabled={disabled}
          title={disabled ? disabledHint : undefined}
        >
          {t("filesPage.processing.start", "Process files in this folder...")}
        </Menu.Item>
      </>
    );
  }
  if (!processing.enabled) {
    // Paused, not gone: the pair kept its history, so resuming never re-runs
    // what was already done. Removing is the destructive option, named as such.
    return (
      <>
        {heading}
        <Menu.Item
          leftSection={<PlayArrowIcon fontSize="small" />}
          onClick={onResume}
          disabled={disabled}
          title={disabled ? disabledHint : undefined}
        >
          {t("filesPage.processing.resume", "Resume processing")}
        </Menu.Item>
        {onEdit && (
          <Menu.Item
            leftSection={<TuneIcon fontSize="small" />}
            onClick={onEdit}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
          >
            {t("filesPage.processing.edit", "Edit processing...")}
          </Menu.Item>
        )}
        {onRevertAll && (
          <Menu.Item
            leftSection={<HistoryIcon fontSize="small" />}
            onClick={onRevertAll}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
          >
            {t("filesPage.processing.restoreAll", "Restore all originals")}
          </Menu.Item>
        )}
        <Menu.Item
          color="red"
          leftSection={<AutoModeIcon fontSize="small" />}
          onClick={onRemove}
          disabled={disabled}
          title={disabled ? disabledHint : undefined}
        >
          {t("filesPage.processing.remove", "Remove processing")}
        </Menu.Item>
      </>
    );
  }
  return (
    <>
      {heading}
      {!continuous && (
        <Menu.Item
          leftSection={<ReplayIcon fontSize="small" />}
          onClick={onRun}
        >
          {t("filesPage.processing.sweep", "Retry failed files")}
        </Menu.Item>
      )}
      <Menu.Item leftSection={<PauseIcon fontSize="small" />} onClick={onStop}>
        {t("filesPage.processing.stop", "Pause processing")}
      </Menu.Item>
      {onEdit && (
        <Menu.Item leftSection={<TuneIcon fontSize="small" />} onClick={onEdit}>
          {t("filesPage.processing.edit", "Edit processing...")}
        </Menu.Item>
      )}
      {onRevertAll && (
        <Menu.Item
          leftSection={<HistoryIcon fontSize="small" />}
          onClick={onRevertAll}
        >
          {t("filesPage.processing.restoreAll", "Restore all originals")}
        </Menu.Item>
      )}
      {/* Offered while running too: detaching the folder from its pipeline
          should not require pausing it first. */}
      <Menu.Item
        color="red"
        leftSection={<AutoModeIcon fontSize="small" />}
        onClick={onRemove}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
      >
        {t("filesPage.processing.remove", "Remove processing")}
      </Menu.Item>
    </>
  );
}
