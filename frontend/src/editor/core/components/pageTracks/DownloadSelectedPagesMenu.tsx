import { Menu } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon, IconName } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { SelectedPagesLayout } from "@app/components/pageTracks/buildTrackFile";

interface DownloadSelectedPagesMenuProps {
  label: string;
  eachPageLabel: string;
  oneFileLabel: string;
  iconName: IconName;
  disabled: boolean;
  onDownload: (layout: SelectedPagesLayout) => void;
}

/** The selected-pages download for several pages, which can go out as one file or one per page. */
export function DownloadSelectedPagesMenu({
  label,
  eachPageLabel,
  oneFileLabel,
  iconName,
  disabled,
  onDownload,
}: DownloadSelectedPagesMenuProps) {
  return (
    <Menu shadow="md" position="bottom-start">
      <Menu.Target>
        <div style={{ display: "inline-flex" }}>
          <Tooltip content={label} position="bottom" offset={6} arrow>
            <ActionIcon
              variant="quiet"
              hover={false}
              className="workbench-bar-action-icon"
              disabled={disabled}
              aria-label={label}
            >
              <Icon name={iconName} size="1.25rem" />
            </ActionIcon>
          </Tooltip>
        </div>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => onDownload("eachPage")}>
          {eachPageLabel}
        </Menu.Item>
        <Menu.Item onClick={() => onDownload("oneFile")}>
          {oneFileLabel}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
