import { Fragment, useId, useState, useEffect, useRef } from "react";
import { Paper, Group, Menu, NumberInput, TextInput } from "@mantine/core";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import { useTranslation } from "react-i18next";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useWorkbenchBar } from "@editor/contexts/WorkbenchBarContext";
import { useViewerPageTool } from "@editor/contexts/viewer/ViewerPageTool";
import { useIsPhone } from "@editor/hooks/useIsMobile";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { ActionIcon } from "@editor/ui/ActionIcon";
import "@editor/components/viewer/PdfViewerToolbar.css";
import {
  SelectedNote,
  toggleProps,
} from "@editor/components/viewer/ViewerBarControls";
import { Icon, type IconName } from "@editor/ui/Icon";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import {
  defaultZoomLevel,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
} from "@editor/components/viewer/defaultZoom";

// Sizing constants for the page number input
const MIN_PAGE_DIGITS = 2;
const MIN_INPUT_WIDTH_PX = 48;
const BASE_INPUT_WIDTH_PX = 32;
const PX_PER_DIGIT = 8;

/**
 * The current zoom as an editable percentage. Typing replaces it on Enter or
 * on leaving the box; Escape puts the current zoom back.
 */
function ZoomPercentInput({
  percent,
  onCommit,
  label,
}: {
  percent: number;
  onCommit: (percent: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Enter and Escape blur before the cleared draft renders; that blur must
  // not commit again.
  const discardRef = useRef(false);
  const commit = () => {
    if (discardRef.current) {
      discardRef.current = false;
      return;
    }
    if (draft === null) return;
    const typed = Number.parseFloat(draft.replace("%", ""));
    if (Number.isFinite(typed)) {
      onCommit(
        Math.min(
          Math.max(Math.round(typed), MIN_ZOOM_PERCENT),
          MAX_ZOOM_PERCENT,
        ),
      );
    }
    setDraft(null);
  };
  return (
    <TextInput
      value={draft ?? `${percent}%`}
      onFocus={(e) => {
        // Same text as shown, so the selection survives the re-render and
        // typing replaces it.
        setDraft(`${percent}%`);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          discardRef.current = true;
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          discardRef.current = true;
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      aria-label={label}
      inputMode="decimal"
      size="xs"
      data-testid="viewer-zoom-input"
      styles={{
        input: {
          width: "3.75rem",
          textAlign: "center",
          fontWeight: 500,
          fontSize: 13,
          paddingLeft: 4,
          paddingRight: 4,
        },
      }}
    />
  );
}

interface PdfViewerToolbarProps {
  // Page navigation props (placeholders for now)
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function PdfViewerToolbar({
  currentPage = 1,
  totalPages: _totalPages = 1,
  onPageChange,
}: PdfViewerToolbarProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  // Phone keeps big hit targets; on desktop the bar sits at the rails' scale.
  const buttonMinWidth = isPhone ? "3rem" : undefined;
  const buttonSize = isPhone ? "lg" : "sm";
  const {
    getScrollState,
    getZoomState,
    scrollActions,
    zoomActions,
    rotationActions,
    zoomRestorePendingRef,
    zoomRestoreSettledTick,
    registerImmediateZoomUpdate,
    registerImmediateScrollUpdate,
  } = useViewer();
  const { buttons, actions, allButtonsDisabled } = useWorkbenchBar();
  const { preferences } = usePreferences();
  // Resetting returns to the zoom documents open at, as set in the View menu.
  const resetZoomLevel = defaultZoomLevel(preferences.defaultViewerZoom);
  const [resetZoomIcon, resetZoomLabel]: [IconName, string] =
    resetZoomLevel === ZoomMode.FitPage
      ? ["scan", t("viewer.resetZoomFitPage", "Reset zoom: fit to page")]
      : resetZoomLevel === ZoomMode.FitWidth
        ? [
            "arrow-left-right",
            t("viewer.resetZoomFitWidth", "Reset zoom: fit to width"),
          ]
        : [
            "scan",
            t("viewer.resetZoomPercent", "Reset zoom: {{percent}}%", {
              percent: Math.round(Number(resetZoomLevel) * 100),
            }),
          ];
  const handleResetZoom = () => zoomActions.requestZoom(resetZoomLevel);
  // Viewer controls registered for this bar rather than the top one.
  const pageBarButtons = buttons.filter(
    (button) => button.section === "page-bar" && (button.visible ?? true),
  );
  // A narrow bar folds these into a Tools menu where the first of them sits.
  const foldingButtons = pageBarButtons.filter(
    (button) => button.foldsIntoMenu,
  );
  const firstFoldingId = foldingButtons[0]?.id;
  // The menu shows a folded tool that is on, as the tool's own button would.
  const activeFoldedTool = foldingButtons.find((button) => button.active);
  const toolsLabel = t("viewer.tools", "Tools");
  const selectedNoteId = useId();

  // A page tool edits pages upright, so the view stays unrotated while it is open.
  const rotateDisabled = useViewerPageTool() != null;
  const rotateLeftLabel = t("workbenchBar.rotateLeft", "Rotate Left");
  const rotateRightLabel = t("workbenchBar.rotateRight", "Rotate Right");
  const rotations = [
    ["rotate-ccw", rotateLeftLabel, () => rotationActions.rotateBackward()],
    ["rotate-cw", rotateRightLabel, () => rotationActions.rotateForward()],
  ] as const;
  // Rotation joins the Tools menu when the bar narrows, so it stays reachable.
  const rotateClass = firstFoldingId
    ? "pdf-viewer-toolbar__tool--folds"
    : "pdf-viewer-toolbar-wide-only";

  const scrollState = getScrollState();
  const zoomState = getZoomState();
  const [pageInput, setPageInput] = useState(
    scrollState.currentPage || currentPage,
  );
  const committedPageRef = useRef(pageInput);
  const [displayZoomPercent, setDisplayZoomPercent] = useState(
    () => zoomState.zoomPercent || 100,
  );

  // Keep the subscription; sync live state in a separate effect.
  useEffect(() => {
    const unregister = registerImmediateScrollUpdate(
      (currentPage, _totalPages) => {
        setPageInput(currentPage);
      },
    );
    return () => {
      unregister?.();
    };
  }, [registerImmediateScrollUpdate]);

  useEffect(() => {
    setPageInput(scrollState.currentPage);
    committedPageRef.current = scrollState.currentPage;
  }, [scrollState.currentPage]);

  // A carried zoom's fit pass is intermediate, so the readout holds until its
  // settled tick re-syncs from the live state.
  useEffect(() => {
    const unregister = registerImmediateZoomUpdate((percent) => {
      if (zoomRestorePendingRef.current) return;
      setDisplayZoomPercent(percent);
    });
    return () => {
      unregister?.();
    };
  }, [registerImmediateZoomUpdate, getZoomState, zoomRestorePendingRef]);

  useEffect(() => {
    if (!zoomRestorePendingRef.current) {
      setDisplayZoomPercent(zoomState.zoomPercent || 100);
    }
  }, [zoomState.zoomPercent, zoomRestorePendingRef, zoomRestoreSettledTick]);

  const handleZoomOut = () => {
    zoomActions.zoomOut();
  };

  const handleZoomIn = () => {
    zoomActions.zoomIn();
  };

  const handlePageNavigation = (page: number) => {
    scrollActions.scrollToPage(page);
    if (onPageChange) {
      onPageChange(page);
    }
    setPageInput(page);
  };

  // Commit on Enter or blur so typing "120" scrolls once.
  const commitPageInput = () => {
    const page = Number(pageInput);
    if (Number.isInteger(page) && page >= 1 && page <= scrollState.totalPages) {
      // Enter already committed; don't scroll again on the following blur.
      if (page !== committedPageRef.current) {
        committedPageRef.current = page;
        handlePageNavigation(page);
      }
    } else {
      setPageInput(scrollState.currentPage);
    }
  };

  const handleFirstPage = () => {
    scrollActions.scrollToFirstPage();
  };

  const handlePreviousPage = () => {
    const { currentPage: cur } = getScrollState();
    if (cur > 1) scrollActions.scrollToPage(cur - 1);
  };

  const handleNextPage = () => {
    const { currentPage: cur, totalPages: tot } = getScrollState();
    if (cur < tot) scrollActions.scrollToPage(cur + 1);
  };

  const handleLastPage = () => {
    scrollActions.scrollToLastPage();
  };

  const totalPagesDigits = Math.max(
    MIN_PAGE_DIGITS,
    (scrollState.totalPages || 1).toString().length,
  );
  const inputWidth = Math.max(
    MIN_INPUT_WIDTH_PX,
    BASE_INPUT_WIDTH_PX + totalPagesDigits * PX_PER_DIGIT,
  );

  return (
    <Paper
      className="pdf-viewer-toolbar"
      px={10}
      py={6}
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        rowGap: 4,
        gap: 6,
        justifyContent: "center",
        pointerEvents: "auto",
      }}
    >
      {/* First Page Button */}
      {!isPhone && (
        <ActionIcon
          variant="tertiary"
          size={buttonSize}
          className="pdf-viewer-toolbar-wide-only"
          onClick={handleFirstPage}
          disabled={scrollState.currentPage === 1}
          style={{ minWidth: buttonMinWidth }}
          title={t("viewer.firstPage", "First Page")}
          aria-label={t("viewer.firstPage", "First Page")}
        >
          <Icon name="chevron-first" size={18} />
        </ActionIcon>
      )}

      {/* Previous Page Button */}
      <ActionIcon
        variant="tertiary"
        size={buttonSize}
        onClick={handlePreviousPage}
        disabled={scrollState.currentPage === 1}
        style={{ minWidth: buttonMinWidth }}
        title={t("viewer.previousPage", "Previous Page")}
        aria-label={t("viewer.previousPage", "Previous Page")}
      >
        <Icon name="chevron-left" size={18} />
      </ActionIcon>

      {/* Page Input */}
      <NumberInput
        aria-label={t("viewer.pageNumber", "Page number")}
        value={pageInput}
        onChange={(value) => {
          setPageInput(Number(value));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            commitPageInput();
          }
        }}
        onBlur={commitPageInput}
        min={1}
        max={scrollState.totalPages}
        allowDecimal={false}
        hideControls
        size="xs"
        styles={{
          input: {
            width: inputWidth,
            textAlign: "center",
            fontWeight: 500,
            fontSize: 13,
            paddingLeft: 4,
            paddingRight: 4,
            boxSizing: "border-box",
          },
        }}
      />

      <span
        style={{
          fontWeight: 500,
          fontSize: 13,
          color: "var(--c-text-subtle)",
        }}
      >
        / {scrollState.totalPages}
      </span>

      {/* Next Page Button */}
      <ActionIcon
        variant="tertiary"
        size={buttonSize}
        onClick={handleNextPage}
        disabled={scrollState.currentPage === scrollState.totalPages}
        style={{ minWidth: buttonMinWidth }}
        title={t("viewer.nextPage", "Next Page")}
        aria-label={t("viewer.nextPage", "Next Page")}
      >
        <Icon name="chevron-right" size={18} />
      </ActionIcon>

      {/* Last Page Button */}
      {!isPhone && (
        <ActionIcon
          variant="tertiary"
          size={buttonSize}
          className="pdf-viewer-toolbar-wide-only"
          onClick={handleLastPage}
          disabled={scrollState.currentPage === scrollState.totalPages}
          style={{ minWidth: buttonMinWidth }}
          title={t("viewer.lastPage", "Last Page")}
          aria-label={t("viewer.lastPage", "Last Page")}
        >
          <Icon name="chevron-last" size={18} />
        </ActionIcon>
      )}

      {/* Hairline between the groups, as the rails divide theirs. */}
      {!isPhone && (
        <div className={`pdf-viewer-toolbar__divider ${rotateClass}`} />
      )}

      {!isPhone &&
        rotations.map(([icon, label, rotate]) => (
          <Tooltip key={icon} content={label} position="top" arrow>
            <ActionIcon
              variant="tertiary"
              size={buttonSize}
              className={rotateClass}
              onClick={() => rotate()}
              disabled={rotateDisabled}
              style={{ minWidth: buttonMinWidth }}
              aria-label={label}
            >
              <Icon name={icon} size={18} />
            </ActionIcon>
          </Tooltip>
        ))}

      {pageBarButtons.length > 0 && (
        <>
          <div className="pdf-viewer-toolbar__divider" />
          {pageBarButtons.map((button) => (
            <Fragment key={button.id}>
              {button.id === firstFoldingId && (
                <Tooltip content={toolsLabel} position="top" arrow>
                  {/* Menu.Target is the button: popup ARIA is invalid on a span. */}
                  <span className="pdf-viewer-toolbar__tools-menu">
                    <Menu
                      shadow="md"
                      position="top"
                      withinPortal
                      closeOnItemClick={false}
                    >
                      <Menu.Target>
                        <ActionIcon
                          variant={activeFoldedTool ? "primary" : "tertiary"}
                          size={buttonSize}
                          aria-label={toolsLabel}
                          data-testid="viewer-page-tools-menu"
                        >
                          {activeFoldedTool?.icon ?? (
                            <Icon name="pencil-ruler" size={18} />
                          )}
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <SelectedNote id={selectedNoteId} />
                        {foldingButtons.map((tool) => (
                          <Menu.Item
                            key={tool.id}
                            leftSection={tool.icon}
                            {...toggleProps(
                              Boolean(tool.active),
                              selectedNoteId,
                            )}
                            disabled={Boolean(
                              tool.disabled ||
                              allButtonsDisabled ||
                              !actions[tool.id],
                            )}
                            onClick={() => actions[tool.id]?.()}
                          >
                            {tool.ariaLabel}
                          </Menu.Item>
                        ))}
                        <Menu.Divider />
                        {rotations.map(([icon, label, rotate]) => (
                          <Menu.Item
                            key={icon}
                            leftSection={<Icon name={icon} size={18} />}
                            disabled={rotateDisabled}
                            onClick={() => rotate()}
                          >
                            {label}
                          </Menu.Item>
                        ))}
                      </Menu.Dropdown>
                    </Menu>
                  </span>
                </Tooltip>
              )}
              <span
                className={
                  button.foldsIntoMenu
                    ? "pdf-viewer-toolbar__tool pdf-viewer-toolbar__tool--folds"
                    : "pdf-viewer-toolbar__tool"
                }
                data-active={button.active || undefined}
              >
                {button.render?.({
                  id: button.id,
                  disabled: Boolean(button.disabled || allButtonsDisabled),
                  allButtonsDisabled,
                  action: actions[button.id],
                  triggerAction: () => actions[button.id]?.(),
                  active: Boolean(button.active),
                })}
              </span>
            </Fragment>
          ))}
        </>
      )}

      {/* Desktop zoom controls */}
      {!isPhone && (
        <Group gap={4} align="center" wrap="nowrap" style={{ flexShrink: 0 }}>
          <div className="pdf-viewer-toolbar__divider" />
          <ActionIcon
            variant="tertiary"
            size={buttonSize}
            onClick={handleZoomOut}
            aria-label={t("viewer.zoomOut", "Zoom out")}
          >
            <Icon name="zoom-out" size={18} />
          </ActionIcon>
          <ZoomPercentInput
            percent={displayZoomPercent}
            onCommit={(percent) => zoomActions.setZoomLevel?.(percent / 100)}
            label={t("viewer.zoomLevel", "Zoom level")}
          />
          <ActionIcon
            variant="tertiary"
            size={buttonSize}
            onClick={handleZoomIn}
            aria-label={t("viewer.zoomIn", "Zoom in")}
          >
            <Icon name="zoom-in" size={18} />
          </ActionIcon>
          <Tooltip content={resetZoomLabel} position="top" arrow>
            <ActionIcon
              variant="tertiary"
              size={buttonSize}
              onClick={handleResetZoom}
              aria-label={resetZoomLabel}
              data-testid="viewer-reset-zoom"
            >
              <Icon name={resetZoomIcon} size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}

      {isPhone && (
        <Menu
          shadow="md"
          width={240}
          position="top-end"
          closeOnItemClick={false}
        >
          <Menu.Target>
            <ActionIcon
              variant="secondary"
              size="lg"
              aria-label={t("viewer.moreOptions", "More")}
              style={{ marginLeft: 4 }}
            >
              <Icon name="ellipsis-vertical" size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>
              {t("viewer.pageNavigation", "Page navigation")}
            </Menu.Label>
            <Menu.Item
              leftSection={<Icon name="chevron-first" size={18} />}
              disabled={scrollState.currentPage === 1}
              onClick={handleFirstPage}
            >
              {t("viewer.firstPage", "First page")}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="chevron-last" size={18} />}
              disabled={scrollState.currentPage === scrollState.totalPages}
              onClick={handleLastPage}
            >
              {t("viewer.lastPage", "Last page")}
            </Menu.Item>

            <Menu.Divider />
            <Menu.Label>{t("viewer.zoom", "Zoom")}</Menu.Label>
            <Menu.Item
              leftSection={<Icon name="zoom-out" size={18} />}
              onClick={handleZoomOut}
            >
              {t("viewer.zoomOut", "Zoom out")}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="zoom-in" size={18} />}
              onClick={handleZoomIn}
            >
              {t("viewer.zoomIn", "Zoom in")} ({displayZoomPercent}%)
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name={resetZoomIcon} size={18} />}
              onClick={handleResetZoom}
            >
              {resetZoomLabel}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>{t("viewer.rotate", "Rotate")}</Menu.Label>
            <Menu.Item
              leftSection={<Icon name="rotate-ccw" size={18} />}
              disabled={rotateDisabled}
              onClick={() => rotationActions.rotateBackward()}
            >
              {rotateLeftLabel}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="rotate-cw" size={18} />}
              disabled={rotateDisabled}
              onClick={() => rotationActions.rotateForward()}
            >
              {rotateRightLabel}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Paper>
  );
}
