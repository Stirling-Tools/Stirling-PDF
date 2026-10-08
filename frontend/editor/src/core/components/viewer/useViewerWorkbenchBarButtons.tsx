import { useMemo, useState, useEffect, useCallback } from "react";
import { Menu, Slider, Popover, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@app/i18n";
import { useViewer } from "@app/contexts/ViewerContext";
import {
  useWorkbenchBarButtons,
  WorkbenchBarButtonWithAction,
} from "@app/hooks/useWorkbenchBarButtons";
import { Icon } from "@app/ui/Icon";
import { SearchInterface } from "@app/components/viewer/SearchInterface";
import { ViewerDocumentMenu } from "@app/components/viewer/ViewerDocumentMenu";
import ViewerAnnotationControls from "@app/components/viewer/ViewerAnnotationControls";
import { useSidebarContext } from "@app/contexts/SidebarContext";
import { useWorkbenchBarTooltipSide } from "@app/hooks/useWorkbenchBarTooltipSide";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  useNavigationState,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { stripBasePath, withBasePath } from "@app/constants/app";
import { useRedaction, useRedactionMode } from "@app/contexts/RedactionContext";
import { useViewerReadAloud } from "@app/components/viewer/useViewerReadAloud";
import { RulerScaleSettingsButton } from "@app/components/viewer/RulerScaleSettingsButton";
import {
  BarButton,
  BarMenu,
  toggleMark,
} from "@app/components/viewer/ViewerBarControls";
import { useSignature } from "@app/contexts/SignatureContext";
import type { MeasureScale } from "@app/utils/measurementTypes";

export function useViewerWorkbenchBarButtons(
  isRulerActive?: boolean,
  setIsRulerActive?: (v: boolean) => void,
  customScale?: MeasureScale | null,
  setCustomScale?: (scale: MeasureScale | null) => void,
  isScaleCalibrationActive?: boolean,
  startScaleCalibration?: () => void,
  cancelScaleCalibration?: () => void,
) {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const {
    isThumbnailSidebarVisible,
    isBookmarkSidebarVisible,
    isAttachmentSidebarVisible,
    isLayerSidebarVisible,
    hasLayers,
    isCommentsSidebarVisible,
    toggleCommentsSidebar,
    isSearchInterfaceVisible,
    registerImmediatePanUpdate,
  } = viewer;
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isDualPage, setIsDualPage] = useState<boolean>(
    () => viewer.getSpreadState().isDualPage,
  );
  // The spread changes from the keyboard and elsewhere too; follow it.
  useEffect(
    () =>
      viewer.registerImmediateSpreadUpdate((_mode, isDual) =>
        setIsDualPage(isDual),
      ),
    [viewer],
  );
  const { sidebarRefs } = useSidebarContext();
  const { position: tooltipPosition } = useWorkbenchBarTooltipSide(
    sidebarRefs,
    12,
  );
  const {
    handleToolSelect,
    handleToolSelectForced,
    handleBackToTools,
    selectToolInPlace,
  } = useToolWorkflow();
  const { selectedTool } = useNavigationState();
  const { requestNavigation } = useNavigationGuard();
  const { redactionsApplied, activeType: redactionActiveType } = useRedaction();
  const { pendingCount } = useRedactionMode();
  const { isPlacementMode } = useSignature();
  const {
    isReadingAloud,
    speechRate,
    speechLanguage,
    speechVoice,
    supportedLanguageCodes,
    handleReadAloud,
    handleSpeechRateChange,
    handleSpeechLanguageChange,
  } = useViewerReadAloud(i18n.language || "en-US");

  useEffect(() => {
    return registerImmediatePanUpdate((newIsPanning) => {
      setIsPanning(newIsPanning);
    });
  }, [registerImmediatePanUpdate]);

  const isAnnotationsPath = useCallback(() => {
    const cleanPath = stripBasePath(window.location.pathname).toLowerCase();
    return cleanPath === "/annotations" || cleanPath.endsWith("/annotations");
  }, []);

  const [isAnnotationsActive, setIsAnnotationsActive] = useState<boolean>(() =>
    isAnnotationsPath(),
  );

  useEffect(() => {
    if (selectedTool === "annotate") {
      setIsAnnotationsActive(true);
    } else if (selectedTool) {
      setIsAnnotationsActive(false);
    } else {
      setIsAnnotationsActive(isAnnotationsPath());
    }
  }, [selectedTool, isAnnotationsPath]);

  useEffect(() => {
    const handlePopState = () => setIsAnnotationsActive(isAnnotationsPath());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isAnnotationsPath]);

  const searchLabel = t("workbenchBar.search", "Search PDF");
  const panLabel = t("workbenchBar.panMode", "Pan Mode");
  const applyRedactionsLabel = t(
    "workbenchBar.applyRedactionsFirst",
    "Apply redactions first",
  );
  const commentsLabel = t("workbenchBar.toggleComments", "Comments");
  const annotationsLabel = t("workbenchBar.annotations", "Annotations");
  const formFillLabel = t("workbenchBar.formFill", "Form Editor");
  const editTextLabel = t("workbenchBar.editText", "Edit text");
  const rulerLabel = t("workbenchBar.ruler", "Ruler / Measure");
  const rulerSettingsLabel = t("workbenchBar.rulerSettings", "Ruler scale");
  const readAloudLabel = t("workbenchBar.readAloud", "Read Aloud");
  const readAloudSpeedLabel = t("workbenchBar.readAloudSpeed", "Speed");
  const viewLabel = t("workbenchBar.view", "View");
  const showLabel = t("workbenchBar.viewShow", "Show");
  const layoutLabel = t("workbenchBar.viewLayout", "Layout");
  const dualPageLabel = t("workbenchBar.dualPage", "Dual page view");
  const pageColoursLabel = t("workbenchBar.pageColours", "Page colours");
  const pageColourNormalLabel = t("workbenchBar.pageColourNormal", "Normal");
  const pageColourDarkLabel = t("workbenchBar.pageColourDark", "Dark");
  const pageColourSepiaLabel = t("workbenchBar.pageColourSepia", "Sepia");
  const thumbnailsLabel = t("workbenchBar.thumbnails", "Page thumbnails");
  const bookmarksLabel = t("workbenchBar.bookmarks", "Bookmarks");
  const attachmentsLabel = t("workbenchBar.attachments", "Attachments");
  const layersShortLabel = t("workbenchBar.layers", "Layers");
  const showAnnotationsLabel = t("workbenchBar.showAnnotations", "Annotations");
  const annotateLabel = t("workbenchBar.annotate", "Annotate");
  const formsLabel = t("workbenchBar.forms", "Forms");

  const isFormFillActive = (selectedTool as string) === "formFill";
  const isTextEditActive = selectedTool === "pdfTextEditor";
  const isEditingModeActive =
    isTextEditActive ||
    isFormFillActive ||
    isAnnotationsActive ||
    selectedTool === "redact";

  // The editing modes and the ruler exclude each other; entering a mode,
  // from whichever control, puts the ruler away.
  useEffect(() => {
    if (isEditingModeActive) setIsRulerActive?.(false);
  }, [isEditingModeActive, setIsRulerActive]);

  const handleStartScaleCalibration = useCallback(() => {
    startScaleCalibration?.();
    setIsRulerActive?.(true);
    if (isPanning) {
      viewer.panActions.disablePan();
    }
  }, [isPanning, setIsRulerActive, startScaleCalibration, viewer.panActions]);

  const handleCancelScaleCalibration = useCallback(() => {
    cancelScaleCalibration?.();
  }, [cancelScaleCalibration]);

  const handleApplyRulerScale = useCallback(
    (scale: MeasureScale) => {
      setCustomScale?.(scale);
    },
    [setCustomScale],
  );

  const handleResetRulerScale = useCallback(() => {
    setCustomScale?.(null);
  }, [setCustomScale]);

  // Filter languages based on available voices
  const filteredLanguages = useMemo(
    () =>
      Object.entries(supportedLanguages)
        .filter(
          ([code]) =>
            supportedLanguageCodes.size === 0 ||
            supportedLanguageCodes.has(code) ||
            supportedLanguageCodes.has(code.split("-")[0]),
        )
        .map(([code, label]) => ({
          value: code,
          label: label,
        })),
    [supportedLanguageCodes],
  );

  const shouldShowLanguageSelector =
    supportedLanguageCodes.size === 0 || filteredLanguages.length > 1;

  const viewerButtons = useMemo<WorkbenchBarButtonWithAction[]>(() => {
    const panRedactionBlocked =
      !isPanning && pendingCount > 0 && redactionActiveType !== null;

    // Grouped and named: Search and Read aloud stand alone, how the page is
    // shown lives under View, the side panels under Panels, and the editing
    // modes sit together in their own section.
    const buttons: WorkbenchBarButtonWithAction[] = [
      {
        id: "viewer-search",
        tooltip: searchLabel,
        ariaLabel: searchLabel,
        // Beside print and export: things done to the whole document.
        section: "bar" as const,
        order: 10,
        render: ({ disabled }) => (
          <Popover
            position="bottom-end"
            withArrow
            shadow="md"
            offset={8}
            opened={isSearchInterfaceVisible}
            onClose={viewer.searchInterfaceActions.close}
          >
            <Popover.Target>
              {/* The button itself is the target, so a second press reads as
                  a toggle rather than a click outside that reopens it. */}
              <BarButton
                icon="file-search"
                label={searchLabel}
                iconOnly
                active={isSearchInterfaceVisible}
                disabled={disabled}
                onClick={viewer.searchInterfaceActions.toggle}
                // Keep focus in the search box: its blur closes an empty
                // search, and the toggle would then reopen it.
                onMouseDown={(e) => e.preventDefault()}
                testId="viewer-search"
              />
            </Popover.Target>
            <Popover.Dropdown>
              <SearchInterface
                visible={isSearchInterfaceVisible}
                onClose={viewer.searchInterfaceActions.close}
              />
            </Popover.Dropdown>
          </Popover>
        ),
      },
      {
        id: "viewer-pan-mode",
        tooltip: panLabel,
        ariaLabel: panLabel,
        section: "bar" as const,
        order: 12,
        active: isPanning,
        render: ({ disabled }) => (
          <BarButton
            icon="hand"
            label={panRedactionBlocked ? applyRedactionsLabel : panLabel}
            iconOnly
            active={isPanning}
            disabled={disabled || panRedactionBlocked}
            onClick={() => {
              viewer.panActions.togglePan();
              if (!isPanning && isRulerActive) setIsRulerActive?.(false);
            }}
            testId="viewer-pan-mode"
          />
        ),
      },
      {
        id: "viewer-ruler",
        tooltip: rulerLabel,
        ariaLabel: rulerLabel,
        section: "bar" as const,
        order: 14,
        active: Boolean(isRulerActive),
        render: ({ disabled }) => (
          <BarButton
            icon="ruler"
            label={rulerLabel}
            iconOnly
            active={Boolean(isRulerActive)}
            disabled={disabled}
            onClick={() => {
              if (isRulerActive) {
                setIsRulerActive?.(false);
                return;
              }
              const turnOn = () => {
                setIsRulerActive?.(true);
                if (isPanning) viewer.panActions.disablePan();
              };
              // Measuring is a mode of its own: leave any editing mode first,
              // asking about unsaved changes as leaving it always does.
              if (isEditingModeActive) {
                requestNavigation(() => {
                  setIsAnnotationsActive(false);
                  handleBackToTools();
                  turnOn();
                });
              } else {
                turnOn();
              }
            }}
            testId="viewer-ruler"
          />
        ),
      },
      {
        id: "viewer-view",
        tooltip: viewLabel,
        ariaLabel: viewLabel,
        section: "top" as const,
        order: 20,
        render: ({ disabled }) => (
          <BarMenu
            icon="eye"
            label={viewLabel}
            disabled={disabled}
            testId="viewer-view-menu"
          >
            <Menu.Label>{showLabel}</Menu.Label>
            <Menu.Item
              leftSection={<Icon name="rows-2" size="1rem" />}
              rightSection={toggleMark(isThumbnailSidebarVisible)}
              onClick={() => viewer.toggleThumbnailSidebar()}
              closeMenuOnClick={false}
              data-testid="viewer-toggle-sidebar"
            >
              {thumbnailsLabel}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="bookmark" size="1rem" />}
              rightSection={toggleMark(isBookmarkSidebarVisible)}
              onClick={() => viewer.toggleBookmarkSidebar()}
              closeMenuOnClick={false}
              data-testid="viewer-toggle-bookmarks"
            >
              {bookmarksLabel}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="message-square" size="1rem" />}
              rightSection={toggleMark(isCommentsSidebarVisible)}
              onClick={() => toggleCommentsSidebar()}
              closeMenuOnClick={false}
              data-testid="viewer-toggle-comments"
            >
              {commentsLabel}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="paperclip" size="1rem" />}
              rightSection={toggleMark(isAttachmentSidebarVisible)}
              onClick={() => viewer.toggleAttachmentSidebar()}
              closeMenuOnClick={false}
              data-testid="viewer-toggle-attachments"
            >
              {attachmentsLabel}
            </Menu.Item>
            {hasLayers && (
              <Menu.Item
                leftSection={<Icon name="layers" size="1rem" />}
                rightSection={toggleMark(isLayerSidebarVisible)}
                onClick={() => viewer.toggleLayerSidebar()}
                closeMenuOnClick={false}
                data-testid="viewer-toggle-layers"
              >
                {layersShortLabel}
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={<Icon name="eye" size="1rem" />}
              rightSection={toggleMark(viewer.isAnnotationsVisible)}
              disabled={isPlacementMode}
              onClick={viewer.toggleAnnotationsVisibility}
              closeMenuOnClick={false}
              data-testid="viewer-annotation-visibility"
            >
              {showAnnotationsLabel}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>{layoutLabel}</Menu.Label>
            <Menu.Item
              leftSection={<Icon name="columns-2" size="1rem" />}
              rightSection={toggleMark(isDualPage)}
              closeMenuOnClick={false}
              onClick={() => viewer.spreadActions.toggleSpreadMode()}
              data-testid="viewer-dual-page"
            >
              {dualPageLabel}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>{pageColoursLabel}</Menu.Label>
            <div
              className="viewer-page-colours"
              role="radiogroup"
              aria-label={pageColoursLabel}
            >
              {(
                [
                  ["normal", "#ffffff", pageColourNormalLabel],
                  ["dark", "#1c1c20", pageColourDarkLabel],
                  ["sepia", "#e8d7b5", pageColourSepiaLabel],
                ] as const
              ).map(([mode, preview, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={viewer.pdfRenderMode === mode}
                  className="viewer-page-colour"
                  data-active={
                    viewer.pdfRenderMode === mode ? "true" : undefined
                  }
                  onClick={() => viewer.setPdfRenderMode(mode)}
                  data-testid={`viewer-page-colour-${mode}`}
                >
                  <span
                    className="viewer-page-colour__swatch"
                    style={{ background: preview }}
                  />
                  {label}
                </button>
              ))}
            </div>
          </BarMenu>
        ),
      },
      // Scale settings belong to the ruler, so they only show while it is on.
      ...(isRulerActive
        ? [
            {
              id: "viewer-ruler-settings",
              icon: <Icon name="settings" size={"1.5rem"} />,
              tooltip: rulerSettingsLabel,
              ariaLabel: rulerSettingsLabel,
              section: "top" as const,
              order: 25,
              render: ({ disabled }: { disabled?: boolean }) => (
                <RulerScaleSettingsButton
                  disabled={disabled}
                  label={rulerSettingsLabel}
                  tooltipPosition={tooltipPosition}
                  currentScale={customScale}
                  onApplyScale={handleApplyRulerScale}
                  onResetScale={handleResetRulerScale}
                  onStartCalibration={handleStartScaleCalibration}
                  onCancelCalibration={handleCancelScaleCalibration}
                  isCalibrationActive={isScaleCalibrationActive}
                />
              ),
            },
          ]
        : []),
      {
        id: "viewer-read-aloud",
        tooltip: readAloudLabel,
        ariaLabel: readAloudLabel,
        section: "bar" as const,
        order: 40,
        active: isReadingAloud,
        render: ({ disabled }) => (
          <Popover
            position="bottom-end"
            withArrow
            shadow="md"
            offset={8}
            opened={isReadingAloud}
            onClose={() => {}}
            withinPortal
          >
            <Popover.Target>
              <BarButton
                icon="volume-2"
                label={readAloudLabel}
                iconOnly
                active={isReadingAloud}
                disabled={
                  disabled ||
                  typeof window === "undefined" ||
                  !window.speechSynthesis
                }
                onClick={handleReadAloud}
                testId="viewer-read-aloud"
              />
            </Popover.Target>
            <Popover.Dropdown>
              <div style={{ width: "16rem", padding: "0.5rem" }}>
                <div
                  style={{
                    fontSize: "0.75rem",
                    marginBottom: "0.5rem",
                    textAlign: "center",
                  }}
                >
                  {readAloudSpeedLabel}: {speechRate.toFixed(1)}x
                </div>
                <Slider
                  value={speechRate}
                  onChange={handleSpeechRateChange}
                  min={0.5}
                  max={2}
                  step={0.1}
                  marks={[
                    { value: 0.5, label: "0.5x" },
                    { value: 1, label: "1x" },
                    { value: 2, label: "2x" },
                  ]}
                  styles={{
                    markLabel: { fontSize: "0.6rem" },
                  }}
                  mb="md"
                />
                {shouldShowLanguageSelector && (
                  <Select
                    label={t("workbenchBar.readAloudLanguage", "Language")}
                    placeholder={t(
                      "workbenchBar.selectLanguage",
                      "Select language",
                    )}
                    value={speechLanguage}
                    onChange={(value) => {
                      if (value) {
                        handleSpeechLanguageChange(value);
                      }
                    }}
                    data={filteredLanguages}
                    size="xs"
                    searchable
                    mb="sm"
                  />
                )}
              </div>
            </Popover.Dropdown>
          </Popover>
        ),
      },
      {
        id: "viewer-edit-text",
        tooltip: editTextLabel,
        ariaLabel: editTextLabel,
        section: "middle" as const,
        order: 50,
        render: ({ disabled }) => (
          <BarButton
            icon="type"
            label={editTextLabel}
            active={isTextEditActive}
            disabled={disabled}
            onClick={() => {
              // A mode of the viewer, not a trip to the tool: the address
              // stays where it is.
              if (isTextEditActive) handleBackToTools();
              else selectToolInPlace("pdfTextEditor");
            }}
            testId="viewer-edit-text"
          />
        ),
      },
      {
        id: "viewer-annotations",
        tooltip: annotationsLabel,
        ariaLabel: annotationsLabel,
        section: "middle" as const,
        order: 51,
        active: isAnnotationsActive,
        render: ({ disabled }) => (
          <BarButton
            icon="highlighter"
            label={annotateLabel}
            active={isAnnotationsActive}
            disabled={disabled}
            onClick={() => {
              // A second press leaves annotating, asking first when there are
              // unsaved annotation changes.
              if (isAnnotationsActive) {
                requestNavigation(() => {
                  setIsAnnotationsActive(false);
                  handleBackToTools();
                });
                return;
              }
              const hasRedactionChanges = pendingCount > 0 || redactionsApplied;
              const switchToAnnotations = () => {
                const targetPath = withBasePath("/annotations");
                if (window.location.pathname !== targetPath) {
                  window.history.pushState(null, "", targetPath);
                }
                setIsAnnotationsActive(true);
                // Bypasses the unsaved-changes guard: the navigation warning
                // modal already handled that check.
                handleToolSelectForced("annotate");
              };
              if (hasRedactionChanges) requestNavigation(switchToAnnotations);
              else switchToAnnotations();
            }}
            testId="viewer-annotations"
          />
        ),
      },
      {
        id: "viewer-form-fill",
        tooltip: formFillLabel,
        ariaLabel: formFillLabel,
        section: "middle" as const,
        order: 52,
        render: ({ disabled }) => (
          <BarButton
            icon="list-checks"
            label={formsLabel}
            active={isFormFillActive}
            disabled={disabled}
            onClick={() => {
              if (isFormFillActive) handleBackToTools();
              else handleToolSelect("formFill");
            }}
            testId="viewer-form-fill"
          />
        ),
      },
      {
        id: "viewer-annotation-controls",
        section: "middle" as const,
        order: 53,
        render: ({ disabled }) => (
          <ViewerAnnotationControls
            currentView="viewer"
            disabled={disabled}
            labelled
          />
        ),
      },
      {
        id: "viewer-doc-menu",
        section: "row-end" as const,
        order: 60,
        render: ({ disabled }) => <ViewerDocumentMenu disabled={disabled} />,
      },
    ];

    return buttons;
  }, [
    t,
    i18n.language,
    viewer,
    isCommentsSidebarVisible,
    toggleCommentsSidebar,
    isPlacementMode,
    redactionsApplied,
    handleToolSelectForced,
    requestNavigation,
    viewLabel,
    showLabel,
    layoutLabel,
    isDualPage,
    dualPageLabel,
    pageColoursLabel,
    pageColourNormalLabel,
    pageColourDarkLabel,
    pageColourSepiaLabel,
    thumbnailsLabel,
    bookmarksLabel,
    attachmentsLabel,
    layersShortLabel,
    showAnnotationsLabel,
    annotateLabel,
    formsLabel,
    commentsLabel,
    isThumbnailSidebarVisible,
    isBookmarkSidebarVisible,
    isAttachmentSidebarVisible,
    isLayerSidebarVisible,
    hasLayers,
    isSearchInterfaceVisible,
    isPanning,
    searchLabel,
    panLabel,
    applyRedactionsLabel,
    tooltipPosition,
    annotationsLabel,
    isAnnotationsActive,
    handleToolSelect,
    pendingCount,
    redactionActiveType,
    formFillLabel,
    isFormFillActive,
    editTextLabel,
    isTextEditActive,
    isEditingModeActive,
    selectToolInPlace,
    handleBackToTools,
    rulerLabel,
    rulerSettingsLabel,
    isRulerActive,
    setIsRulerActive,
    handleStartScaleCalibration,
    handleCancelScaleCalibration,
    handleApplyRulerScale,
    handleResetRulerScale,
    customScale,
    isScaleCalibrationActive,
    readAloudLabel,
    readAloudSpeedLabel,
    isReadingAloud,
    speechRate,
    speechLanguage,
    speechVoice,
    supportedLanguageCodes,
    filteredLanguages,
    shouldShowLanguageSelector,
    handleReadAloud,
    handleSpeechRateChange,
    handleSpeechLanguageChange,
  ]);

  useWorkbenchBarButtons(viewerButtons);
}
