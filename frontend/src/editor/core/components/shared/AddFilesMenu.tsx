import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { RichMenuItem } from "@editor/components/createPdf/CreatePdfMenuItems";
import { useFileSources } from "@editor/components/shared/useFileSources";

/** The tool panel Files step's "+" menu of the places files can come from. */
export function AddFilesMenu() {
  const { t } = useTranslation();
  const { sources, pickers } = useFileSources();

  return (
    // A tool step's header toggles the step on click. React bubbles events out
    // of portals too, so clicks in the menu and modal must stop here.
    <span onClick={(event) => event.stopPropagation()}>
      <Menu position="bottom-end" withinPortal shadow="md" width={300}>
        <Menu.Target>
          <ActionIcon
            variant="tertiary"
            size="sm"
            shape="circle"
            aria-label={t("files.addFiles", "Add files")}
          >
            <Icon name="plus" size="1.1rem" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t("files.addFiles", "Add files")}</Menu.Label>
          {sources.map((source) => (
            <RichMenuItem
              key={source.key}
              icon={<Icon name={source.icon} size={16} />}
              label={source.menuLabel}
              onClick={source.onClick}
              testId={source.testId}
            />
          ))}
        </Menu.Dropdown>
      </Menu>
      {pickers}
    </span>
  );
}
