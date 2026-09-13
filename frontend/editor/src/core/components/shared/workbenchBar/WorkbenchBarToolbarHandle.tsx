import { useTranslation } from "react-i18next";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { Button } from "@app/ui/Button";

interface WorkbenchBarToolbarHandleProps {
  isMobile: boolean;
  /** Mobile only: whether the tool row is showing every tool rather than scrolling. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Desktop viewer only: retracts the whole tool row. Omit to render no handle. */
  onRetract?: () => void;
}

/**
 * Handle pinned to the right of the tool row. On mobile it expands the row from
 * a single scrolling line to a wrapped grid; on the desktop viewer it retracts
 * the row entirely.
 */
export default function WorkbenchBarToolbarHandle({
  isMobile,
  expanded,
  onToggleExpanded,
  onRetract,
}: WorkbenchBarToolbarHandleProps) {
  const { t } = useTranslation();

  if (isMobile) {
    return (
      <Button
        type="button"
        variant="quiet"
        size="lg"
        className="workbench-bar-toolbar-handle workbench-bar-toolbar-handle-expand"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? t("workbenchBar.showFewerTools", "Collapse toolbar")
            : t("workbenchBar.showAllTools", "Show all tools")
        }
        leftSection={
          expanded ? (
            <KeyboardArrowUpIcon sx={{ fontSize: "1.25rem" }} />
          ) : (
            <KeyboardArrowDownIcon sx={{ fontSize: "1.25rem" }} />
          )
        }
      />
    );
  }

  if (!onRetract) return null;

  return (
    <Button
      type="button"
      variant="quiet"
      className="workbench-bar-toolbar-handle workbench-bar-toolbar-handle-retract"
      onClick={onRetract}
      aria-expanded
      aria-label={t("workbenchBar.hideToolbar", "Hide toolbar")}
      title={t("workbenchBar.hideToolbar", "Hide toolbar")}
      leftSection={<KeyboardArrowUpIcon sx={{ fontSize: "1rem" }} />}
    />
  );
}
