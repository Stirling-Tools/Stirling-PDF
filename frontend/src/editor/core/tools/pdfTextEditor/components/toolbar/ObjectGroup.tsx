import { Menu, Tooltip } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import {
  NO_SHRINK,
  type Controller,
} from "@app/tools/pdfTextEditor/components/toolbar/toolbarShared";

export function ObjectGroup({ controller }: { controller: Controller }) {
  const { t } = useTranslation();
  const {
    selectionAllLocked,
    onToggleLock,
    onDelete,
    onChangeZOrder,
    onAlign,
    onDistribute,
    selectionCount,
    canAlignLines,
  } = controller;
  const alignDisabled = selectionCount < 2;
  const hAlignDisabled = selectionCount < 2 && !canAlignLines;
  const distributeDisabled = selectionCount < 3;

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
      <Menu shadow="md" position="bottom-start" withinPortal closeOnItemClick>
        <Menu.Target>
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
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t("pdfTextEditor.toolbar.order", "Order")}</Menu.Label>
          <Menu.Item
            leftSection={<Icon name="bring-to-front" size={20} />}
            onClick={() => onChangeZOrder("to-front")}
            data-testid="pdf-editor-z-to-front"
          >
            {t("pdfTextEditor.toolbar.bringToFront", "Bring to front")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="arrow-up" size={20} />}
            onClick={() => onChangeZOrder("forward")}
            data-testid="pdf-editor-z-forward"
          >
            {t("pdfTextEditor.toolbar.bringForward", "Bring forward")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="arrow-down" size={20} />}
            onClick={() => onChangeZOrder("backward")}
            data-testid="pdf-editor-z-backward"
          >
            {t("pdfTextEditor.toolbar.sendBackward", "Send backward")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="send-to-back" size={20} />}
            onClick={() => onChangeZOrder("to-back")}
            data-testid="pdf-editor-z-to-back"
          >
            {t("pdfTextEditor.toolbar.sendToBack", "Send to back")}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>
            {t("pdfTextEditor.toolbar.alignLabel", "Align · needs 2+ objects")}
          </Menu.Label>
          <Menu.Item
            leftSection={<Icon name="align-start-vertical" size={20} />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("left")}
            data-testid="pdf-editor-align-left"
          >
            {t("pdfTextEditor.toolbar.alignLeft", "Align left")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="align-center-vertical" size={20} />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("center-h")}
            data-testid="pdf-editor-align-center-h"
          >
            {t("pdfTextEditor.toolbar.alignCentre", "Align centre")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="align-end-vertical" size={20} />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("right")}
            data-testid="pdf-editor-align-right"
          >
            {t("pdfTextEditor.toolbar.alignRight", "Align right")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="align-start-horizontal" size={20} />}
            disabled={alignDisabled}
            onClick={() => onAlign("top")}
            data-testid="pdf-editor-align-top"
          >
            {t("pdfTextEditor.toolbar.alignTop", "Align top")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="align-center-horizontal" size={20} />}
            disabled={alignDisabled}
            onClick={() => onAlign("middle-v")}
            data-testid="pdf-editor-align-middle-v"
          >
            {t("pdfTextEditor.toolbar.alignMiddle", "Align middle")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="align-end-horizontal" size={20} />}
            disabled={alignDisabled}
            onClick={() => onAlign("bottom")}
            data-testid="pdf-editor-align-bottom"
          >
            {t("pdfTextEditor.toolbar.alignBottom", "Align bottom")}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>
            {t(
              "pdfTextEditor.toolbar.distributeLabel",
              "Distribute · needs 3+ objects",
            )}
          </Menu.Label>
          <Menu.Item
            leftSection={<Icon name="spline" size={20} />}
            disabled={distributeDisabled}
            onClick={() => onDistribute("horizontal")}
            data-testid="pdf-editor-distribute-h"
          >
            {t(
              "pdfTextEditor.toolbar.distributeHorizontally",
              "Distribute horizontally",
            )}
          </Menu.Item>
          <Menu.Item
            leftSection={
              <Icon
                name="spline"
                size={20}
                style={{ transform: "rotate(90deg)" }}
              />
            }
            disabled={distributeDisabled}
            onClick={() => onDistribute("vertical")}
            data-testid="pdf-editor-distribute-v"
          >
            {t(
              "pdfTextEditor.toolbar.distributeVertically",
              "Distribute vertically",
            )}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
