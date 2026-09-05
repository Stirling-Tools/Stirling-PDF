import { Menu, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import LockIcon from "@mui/icons-material/LockOutlined";
import LockOpenIcon from "@mui/icons-material/LockOpenOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LayersIcon from "@mui/icons-material/LayersOutlined";
import FlipToFrontIcon from "@mui/icons-material/FlipToFrontOutlined";
import FlipToBackIcon from "@mui/icons-material/FlipToBackOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import VerticalAlignTopIcon from "@mui/icons-material/VerticalAlignTop";
import VerticalAlignBottomIcon from "@mui/icons-material/VerticalAlignBottom";
import VerticalAlignCenterIcon from "@mui/icons-material/VerticalAlignCenter";
import AlignHorizontalLeftIcon from "@mui/icons-material/AlignHorizontalLeftOutlined";
import AlignHorizontalCenterIcon from "@mui/icons-material/AlignHorizontalCenterOutlined";
import AlignHorizontalRightIcon from "@mui/icons-material/AlignHorizontalRightOutlined";
import LinearScaleIcon from "@mui/icons-material/LinearScaleOutlined";
import {
  NO_SHRINK,
  type Controller,
} from "@app/tools/pdfTextEditor/components/toolbar/toolbarShared";

/** Verbs that apply to any object: lock, delete, and Arrange. */
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
  // Vertical aligns + distribute need 2+ objects. Horizontal aligns also
  // accept a single multi-line paragraph (aligns its lines to each other).
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
              <LockIcon fontSize="small" />
            ) : (
              <LockOpenIcon fontSize="small" />
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
          leftSection={<DeleteIcon fontSize="small" />}
        />
      </Tooltip>
      <Menu shadow="md" position="bottom-start" withinPortal closeOnItemClick>
        <Menu.Target>
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            leftSection={<LayersIcon fontSize="small" />}
            rightSection={<ExpandMoreIcon fontSize="small" />}
            data-testid="pdf-editor-arrange-menu"
            style={NO_SHRINK}
          >
            {t("pdfTextEditor.toolbar.arrange", "Arrange")}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t("pdfTextEditor.toolbar.order", "Order")}</Menu.Label>
          <Menu.Item
            leftSection={<FlipToFrontIcon fontSize="small" />}
            onClick={() => onChangeZOrder("to-front")}
            data-testid="pdf-editor-z-to-front"
          >
            {t("pdfTextEditor.toolbar.bringToFront", "Bring to front")}
          </Menu.Item>
          <Menu.Item
            leftSection={<ArrowUpwardIcon fontSize="small" />}
            onClick={() => onChangeZOrder("forward")}
            data-testid="pdf-editor-z-forward"
          >
            {t("pdfTextEditor.toolbar.bringForward", "Bring forward")}
          </Menu.Item>
          <Menu.Item
            leftSection={<ArrowDownwardIcon fontSize="small" />}
            onClick={() => onChangeZOrder("backward")}
            data-testid="pdf-editor-z-backward"
          >
            {t("pdfTextEditor.toolbar.sendBackward", "Send backward")}
          </Menu.Item>
          <Menu.Item
            leftSection={<FlipToBackIcon fontSize="small" />}
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
            leftSection={<AlignHorizontalLeftIcon fontSize="small" />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("left")}
            data-testid="pdf-editor-align-left"
          >
            {t("pdfTextEditor.toolbar.alignLeft", "Align left")}
          </Menu.Item>
          <Menu.Item
            leftSection={<AlignHorizontalCenterIcon fontSize="small" />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("center-h")}
            data-testid="pdf-editor-align-center-h"
          >
            {t("pdfTextEditor.toolbar.alignCentre", "Align centre")}
          </Menu.Item>
          <Menu.Item
            leftSection={<AlignHorizontalRightIcon fontSize="small" />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("right")}
            data-testid="pdf-editor-align-right"
          >
            {t("pdfTextEditor.toolbar.alignRight", "Align right")}
          </Menu.Item>
          <Menu.Item
            leftSection={<VerticalAlignTopIcon fontSize="small" />}
            disabled={alignDisabled}
            onClick={() => onAlign("top")}
            data-testid="pdf-editor-align-top"
          >
            {t("pdfTextEditor.toolbar.alignTop", "Align top")}
          </Menu.Item>
          <Menu.Item
            leftSection={<VerticalAlignCenterIcon fontSize="small" />}
            disabled={alignDisabled}
            onClick={() => onAlign("middle-v")}
            data-testid="pdf-editor-align-middle-v"
          >
            {t("pdfTextEditor.toolbar.alignMiddle", "Align middle")}
          </Menu.Item>
          <Menu.Item
            leftSection={<VerticalAlignBottomIcon fontSize="small" />}
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
            leftSection={<LinearScaleIcon fontSize="small" />}
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
              <LinearScaleIcon
                fontSize="small"
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
