import { Menu } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";

import { ProcessingFolderState } from "@app/hooks/useProcessingFolders";

/**
 * The processing entries of a folder's action menu, carried by every folder kind
 * including mounts, whose other edit actions are hidden.
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
          leftSection={<Icon name="workflow" size={20} />}
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
          leftSection={<Icon name="play" size={20} />}
          onClick={onResume}
          disabled={disabled}
          title={disabled ? disabledHint : undefined}
        >
          {t("filesPage.processing.resume", "Resume processing")}
        </Menu.Item>
        {onEdit && (
          <Menu.Item
            leftSection={<Icon name="sliders-horizontal" size={20} />}
            onClick={onEdit}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
          >
            {t("filesPage.processing.edit", "Edit processing...")}
          </Menu.Item>
        )}
        {onRevertAll && (
          <Menu.Item
            leftSection={<Icon name="rotate-ccw-clock" size={20} />}
            onClick={onRevertAll}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
          >
            {t("filesPage.processing.restoreAll", "Restore all originals")}
          </Menu.Item>
        )}
        <Menu.Item
          color="red"
          leftSection={<Icon name="workflow" size={20} />}
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
          leftSection={<Icon name="refresh-cw" size={20} />}
          onClick={onRun}
        >
          {t("filesPage.processing.sweep", "Retry failed files")}
        </Menu.Item>
      )}
      <Menu.Item leftSection={<Icon name="pause" size={20} />} onClick={onStop}>
        {t("filesPage.processing.stop", "Pause processing")}
      </Menu.Item>
      {onEdit && (
        <Menu.Item
          leftSection={<Icon name="sliders-horizontal" size={20} />}
          onClick={onEdit}
        >
          {t("filesPage.processing.edit", "Edit processing...")}
        </Menu.Item>
      )}
      {onRevertAll && (
        <Menu.Item
          leftSection={<Icon name="rotate-ccw-clock" size={20} />}
          onClick={onRevertAll}
        >
          {t("filesPage.processing.restoreAll", "Restore all originals")}
        </Menu.Item>
      )}
      {/* Offered while running too: detaching the folder from its pipeline
          should not require pausing it first. */}
      <Menu.Item
        color="red"
        leftSection={<Icon name="workflow" size={20} />}
        onClick={onRemove}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
      >
        {t("filesPage.processing.remove", "Remove processing")}
      </Menu.Item>
    </>
  );
}
