import { Popover, Tooltip } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import {
  NO_SHRINK,
  type Controller,
} from "@app/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { ArrangePanel } from "@app/tools/pdfTextEditor/components/toolbar/ArrangePanel";

export function ObjectGroup({ controller }: { controller: Controller }) {
  const { t } = useTranslation();
  const { selectionAllLocked, onToggleLock, onDelete } = controller;

  return (
    <>
      <Tooltip
        label={
          selectionAllLocked
            ? t(
                "pdfTextEditor.toolbar.unlockTooltip",
                "Unlock selection - makes it editable again",
              )
            : t(
                "pdfTextEditor.toolbar.lockTooltip",
                "Lock selection - prevents accidental edits",
              )
        }
      >
        <Button
          variant={selectionAllLocked ? "primary" : "tertiary"}
          accent={selectionAllLocked ? "default" : "neutral"}
          size="sm"
          onClick={onToggleLock}
          aria-label={
            selectionAllLocked
              ? t("pdfTextEditor.toolbar.unlock", "Unlock selection")
              : t("pdfTextEditor.toolbar.lock", "Lock selection")
          }
          data-testid="pdf-editor-toggle-lock"
          style={NO_SHRINK}
          leftSection={
            selectionAllLocked ? (
              <Icon name="lock" size={20} />
            ) : (
              <Icon name="lock-open" size={20} />
            )
          }
        />
      </Tooltip>
      <Tooltip label={t("pdfTextEditor.toolbar.deleteTooltip", "Delete (Del)")}>
        <Button
          variant="tertiary"
          accent="danger"
          size="sm"
          onClick={onDelete}
          aria-label={t("pdfTextEditor.toolbar.delete", "Delete selected")}
          data-testid="pdf-editor-delete"
          style={NO_SHRINK}
          leftSection={<Icon name="trash" size={20} />}
        />
      </Tooltip>
      <Popover shadow="md" position="bottom-start" withinPortal>
        <Popover.Target>
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            leftSection={<Icon name="layers" size={20} />}
            rightSection={<Icon name="chevron-down" size={20} />}
            data-testid="pdf-editor-arrange-menu"
            style={NO_SHRINK}
          >
            {t("pdfTextEditor.toolbar.arrange", "Arrange")}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <ArrangePanel controller={controller} />
        </Popover.Dropdown>
      </Popover>
    </>
  );
}
