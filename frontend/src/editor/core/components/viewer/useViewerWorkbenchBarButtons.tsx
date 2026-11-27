import { useMemo, useState, useEffect, useCallback } from "react";
import { Slider, Popover, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@editor/i18n";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useViewerPageTool } from "@editor/contexts/viewer/ViewerPageTool";
import {
  useWorkbenchBarButtons,
  WorkbenchBarButtonWithAction,
} from "@editor/hooks/useWorkbenchBarButtons";
import { Icon, type IconName } from "@editor/ui/Icon";
import { useIsPhone } from "@editor/hooks/useIsMobile";
import { BarButton } from "@editor/components/viewer/ViewerBarControls";
import { ViewerDocumentMenu } from "@editor/components/viewer/ViewerDocumentMenu";
import { ViewerPageViewMenu } from "@editor/components/viewer/ViewerPageViewMenu";
import { AnnotationVisibilityToggle } from "@editor/components/viewer/AnnotationVisibilityToggle";
import { SearchInterface } from "@editor/components/viewer/SearchInterface";
import ViewerAnnotationControls from "@editor/components/viewer/ViewerAnnotationControls";
import { useSidebarContext } from "@editor/contexts/SidebarContext";
import { useWorkbenchBarTooltipSide } from "@editor/hooks/useWorkbenchBarTooltipSide";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import {
  useNavigationState,
  useNavigationGuard,
} from "@editor/contexts/NavigationContext";
import {
  useRedaction,
  useRedactionMode,
} from "@editor/contexts/RedactionContext";
import { useViewerReadAloud } from "@editor/components/viewer/useViewerReadAloud";
import { RulerScaleSettingsButton } from "@editor/components/viewer/RulerScaleSettingsButton";
import type { MeasureScale } from "@editor/utils/measurementTypes";
import type { StirlingFile } from "@editor/types/fileContext";
import {
  reviewMode,
  useReviewMode,
} from "@editor/tools/pdfTextEditor/store/reviewMode";
import {
  useEditOrReview,
  useReviewAvailable,
} from "@editor/tools/pdfTextEditor/hooks/useEditOrReview";

export function useViewerWorkbenchBarButtons(
  isRulerActive?: boolean,
  setIsRulerActive?: (v: boolean) => void,
  customScale?: MeasureScale | null,
  setCustomScale?: (scale: MeasureScale | null) => void,
  isScaleCalibrationActive?: boolean,
  startScaleCalibration?: () => void,
  cancelScaleCalibration?: () => void,
  displayedFile?: StirlingFile | File | null,
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
  const isPhone = useIsPhone();
  const { sidebarRefs } = useSidebarContext();
  const { position: tooltipPosition } = useWorkbenchBarTooltipSide(
    sidebarRefs,
    12,
  );
  const {
    handleToolSelect,
    handleToolSelectForced,
    handleBackToTools,
    clearToolSelection,
    setLeftPanelView,
    setReaderMode,
    readerMode,
    toolRegistry,
  } = useToolWorkflow();
  const { selectedTool } = useNavigationState();
  const { requestNavigation } = useNavigationGuard();
  const { redactionsApplied, activeType: redactionActiveType } = useRedaction();
  const { pendingCount } = useRedactionMode();
  const {
    isReadingAloud,
    speechRate,
    speechLanguage,
    speechVoice,
    supportedLanguageCodes,
    handleReadAloud,
    handleSpeechRateChange,
    handleSpeechLanguageChange,
  } = useViewerReadAloud(i18n.language || "en-US", displayedFile);

  useEffect(() => {
    return registerImmediatePanUpdate((newIsPanning) => {
      setIsPanning(newIsPanning);
    });
  }, [registerImmediatePanUpdate]);

  // The tool the URL resolves to is the single source of truth: a separate
  // mirror drifts the moment the address changes without a popstate.
  const isAnnotationsActive = selectedTool === "annotate";

  const panLabel = t("workbenchBar.panMode", "Pan Mode");
  const applyRedactionsLabel = t(
    "workbenchBar.applyRedactionsFirst",
    "Apply redactions first",
  );
  const pageViewLabel = t("workbenchBar.pageView", "View");
  const annotationVisibilityLabel = t(
    "workbenchBar.toggleAnnotations",
    "Toggle Annotations Visibility",
  );
  const thumbnailsLabel = t("workbenchBar.thumbnails", "Pages");
  const bookmarksLabel = t("workbenchBar.bookmarks", "Bookmarks");
  const attachmentsLabel = t("workbenchBar.attachments", "Attachments");
  const layersLabel = t("workbenchBar.layers", "Layers");
  const commentsLabel = t("workbenchBar.toggleComments", "Comments");
  const annotationsLabel = t("workbenchBar.annotate", "Annotate");
  const exitAnnotationsLabel = t(
    "workbenchBar.exitAnnotations",
    "Exit annotation mode",
  );
  const formFillLabel = t("workbenchBar.formFill", "Form Editor");
  const editTextLabel = t("workbenchBar.editText", "Edit Text");
  const reviewLabel = t("workbenchBar.reviewAccessibility", "Accessibility");
  const { reviewing } = useReviewMode();
  const { startReview, startEditing } = useEditOrReview();
  const reviewAvailable = useReviewAvailable();
  const rulerLabel = t("workbenchBar.ruler", "Ruler / Measure");
  const rulerSettingsLabel = t("workbenchBar.rulerSettings", "Scale Settings");
  const readAloudLabel = t("workbenchBar.readAloud", "Read Aloud");
  const readAloudSpeedLabel = t("workbenchBar.readAloudSpeed", "Speed");

  const isFormFillActive = (selectedTool as string) === "formFill";
  const isTextEditActive = selectedTool === "pdfTextEditor";
  const pageTool = useViewerPageTool();
  const pageToolActive = pageTool != null;
  // While a page tool with its own find is open, the search button opens that.
  const searchLabel = pageTool?.onToggleFind
    ? t("workbenchBar.findReplace", "Find & replace")
    : t("workbenchBar.search", "Search PDF");

  // The text editor owns the pages while it is open, so a viewer tool that
  // works on them closes it first, behind the unsaved-edits prompt. Leaving
  // without a second guard: the prompt has already settled the edits.
  const leaveTextEditThen = useCallback(
    (action: () => void) => {
      if (!isTextEditActive) {
        action();
        return;
      }
      requestNavigation(() => {
        setLeftPanelView("toolPicker");
        setReaderMode(false);
        clearToolSelection();
        action();
      });
    },
    [
      isTextEditActive,
      requestNavigation,
      setLeftPanelView,
      setReaderMode,
      clearToolSelection,
    ],
  );

  const preloadTextEditor = useCallback(
    () => void toolRegistry.pdfTextEditor?.preload?.(),
    [toolRegistry],
  );

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
    // Search, pan, measure and read aloud work through the document in view,
    // so they sit in the page bar below it. The side panels and how the pages
    // are shown get a menu each, and the modes that work on the pages are
    // named. A phone's page bar has no room, so there they join the tool row.
    const pageSection = isPhone ? ("top" as const) : ("page-bar" as const);
    const pageTooltip = isPhone ? tooltipPosition : ("top" as const);
    const pageButtonSize = isPhone ? undefined : ("sm" as const);
    // Reading mode's rail draws read aloud itself. A second copy in the page
    // bar would share its open state, and each popover's outside click would
    // close the other's.
    const railOwned = readerMode && !isPhone;
    const railSection = railOwned ? ("top" as const) : pageSection;
    // A narrow page bar folds these into a menu, which acts through the
    // registered action and shows the registered icon.
    const foldsIntoMenu = pageSection === "page-bar";
    const togglePan = () =>
      leaveTextEditThen(() => {
        viewer.panActions.togglePan();
        if (!isPanning && isRulerActive) setIsRulerActive?.(false);
      });
    const toggleRuler = () =>
      leaveTextEditThen(() => {
        const next = !isRulerActive;
        setIsRulerActive?.(next);
        if (next && isPanning) {
          viewer.panActions.disablePan();
        }
      });
    const popoverPosition = isPhone
      ? ("bottom-end" as const)
      : railOwned
        ? ("left-start" as const)
        : ("top" as const);
    const panelToggle = (
      id: string,
      icon: IconName,
      label: string,
      active: boolean,
      onToggle: () => void,
      section: "row-start" | "row-end",
      order: number,
    ): WorkbenchBarButtonWithAction => ({
      id,
      tooltip: label,
      ariaLabel: label,
      section,
      order,
      active,
      // Registered as the action too, for reading mode's rail, which draws
      // its own round button when no renderer is given.
      onClick: onToggle,
      render: railOwned
        ? undefined
        : ({ disabled }) => (
            <BarButton
              icon={icon}
              label={label}
              iconOnly
              tooltipPosition={tooltipPosition}
              active={active}
              disabled={disabled}
              onClick={onToggle}
              testId={id}
            />
          ),
    });

    const buttons: WorkbenchBarButtonWithAction[] = [
      {
        id: "viewer-search",
        tooltip: searchLabel,
        ariaLabel: searchLabel,
        section: pageSection,
        order: 10,
        render: ({ disabled }) => (
          <Popover
            position={isPhone ? "bottom-end" : "top"}
            withArrow
            shadow="md"
            offset={8}
            opened={isSearchInterfaceVisible}
            onClose={viewer.searchInterfaceActions.close}
          >
            <Popover.Target>
              <BarButton
                icon="file-search"
                label={searchLabel}
                iconOnly
                size={pageButtonSize}
                tooltipPosition={pageTooltip}
                disabled={disabled}
                onClick={() =>
                  pageTool?.onToggleFind
                    ? pageTool.onToggleFind()
                    : leaveTextEditThen(viewer.searchInterfaceActions.toggle)
                }
              />
            </Popover.Target>
            <Popover.Dropdown>
              <div style={{ minWidth: "20rem" }}>
                <SearchInterface
                  visible={isSearchInterfaceVisible}
                  onClose={viewer.searchInterfaceActions.close}
                />
              </div>
            </Popover.Dropdown>
          </Popover>
        ),
      },
      {
        id: "viewer-pan-mode",
        tooltip: panRedactionBlocked ? applyRedactionsLabel : panLabel,
        ariaLabel: panRedactionBlocked ? applyRedactionsLabel : panLabel,
        section: pageSection,
        order: 12,
        active: isPanning,
        icon: <Icon name="hand" size="1rem" />,
        disabled: panRedactionBlocked,
        onClick: togglePan,
        foldsIntoMenu,
        render: ({ disabled }) => (
          <BarButton
            icon="hand"
            label={panRedactionBlocked ? applyRedactionsLabel : panLabel}
            iconOnly
            size={pageButtonSize}
            tooltipPosition={pageTooltip}
            active={isPanning}
            disabled={disabled || panRedactionBlocked}
            onClick={togglePan}
          />
        ),
      },
      {
        id: "viewer-ruler",
        tooltip: rulerLabel,
        ariaLabel: rulerLabel,
        section: pageSection,
        order: 14,
        active: Boolean(isRulerActive),
        icon: <Icon name="ruler" size="1rem" />,
        onClick: toggleRuler,
        foldsIntoMenu,
        render: ({ disabled }) => (
          <BarButton
            icon="ruler"
            label={rulerLabel}
            iconOnly
            size={pageButtonSize}
            tooltipPosition={pageTooltip}
            active={Boolean(isRulerActive)}
            disabled={disabled}
            onClick={toggleRuler}
          />
        ),
      },
      {
        id: "viewer-read-aloud",
        tooltip: readAloudLabel,
        ariaLabel: readAloudLabel,
        section: railSection,
        order: 16,
        active: isReadingAloud,
        icon: <Icon name="volume-2" size="1rem" />,
        disabled: typeof window === "undefined" || !window.speechSynthesis,
        onClick: handleReadAloud,
        foldsIntoMenu: foldsIntoMenu && !railOwned,
        render: ({ disabled }) => (
          <Popover
            position={popoverPosition}
            withArrow
            shadow="md"
            offset={8}
            opened={isReadingAloud}
            onClose={() => {}}
            withinPortal
          >
            <Popover.Target>
              <BarButton
                icon={isReadingAloud ? "square" : "volume-2"}
                label={readAloudLabel}
                iconOnly
                size={pageButtonSize}
                tooltipPosition={pageTooltip}
                active={isReadingAloud}
                disabled={
                  disabled ||
                  typeof window === "undefined" ||
                  !window.speechSynthesis
                }
                onClick={handleReadAloud}
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
      // The side panels as plain toggles at the row's edges: the document's
      // own content panels on the left, page thumbnails beside its menu.
      panelToggle(
        "viewer-toggle-bookmarks",
        "bookmark",
        bookmarksLabel,
        isBookmarkSidebarVisible,
        viewer.toggleBookmarkSidebar,
        "row-start",
        1,
      ),
      panelToggle(
        "viewer-toggle-comments",
        "message-square",
        commentsLabel,
        isCommentsSidebarVisible,
        toggleCommentsSidebar,
        "row-start",
        2,
      ),
      panelToggle(
        "viewer-toggle-attachments",
        "paperclip",
        attachmentsLabel,
        isAttachmentSidebarVisible,
        viewer.toggleAttachmentSidebar,
        "row-start",
        3,
      ),
      ...(hasLayers
        ? [
            panelToggle(
              "viewer-toggle-layers",
              "layers",
              layersLabel,
              isLayerSidebarVisible,
              viewer.toggleLayerSidebar,
              "row-start",
              4,
            ),
          ]
        : []),
      panelToggle(
        "viewer-toggle-sidebar",
        "list",
        thumbnailsLabel,
        isThumbnailSidebarVisible,
        viewer.toggleThumbnailSidebar,
        "row-end",
        59,
      ),
      {
        id: "viewer-page-view",
        tooltip: pageViewLabel,
        ariaLabel: pageViewLabel,
        section: "top" as const,
        order: 21,
        render: ({ disabled }) => <ViewerPageViewMenu disabled={disabled} />,
      },
      {
        id: "viewer-annotation-visibility",
        tooltip: annotationVisibilityLabel,
        ariaLabel: annotationVisibilityLabel,
        section: pageSection,
        order: 18,
        render: ({ disabled }) => (
          <AnnotationVisibilityToggle
            disabled={disabled}
            size={pageButtonSize}
          />
        ),
      },
      // Scale settings belong to the ruler, so they sit beside it while it is
      // on. They don't fold, so a narrow bar keeps them next to the Tools menu.
      ...(isRulerActive
        ? [
            {
              id: "viewer-ruler-settings",
              tooltip: rulerSettingsLabel,
              ariaLabel: rulerSettingsLabel,
              section: pageSection,
              order: 15,
              render: ({ disabled }: { disabled?: boolean }) => (
                <RulerScaleSettingsButton
                  disabled={disabled}
                  label={rulerSettingsLabel}
                  tooltipPosition={pageTooltip}
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
        id: "viewer-edit-text",
        tooltip: editTextLabel,
        ariaLabel: editTextLabel,
        section: "middle" as const,
        order: 50,
        render: ({ disabled }) => (
          <BarButton
            icon="square-pen"
            label={editTextLabel}
            tooltipPosition={tooltipPosition}
            active={isTextEditActive}
            disabled={disabled}
            onClick={() =>
              isTextEditActive
                ? handleBackToTools()
                : reviewing
                  ? startEditing()
                  : handleToolSelect("pdfTextEditor")
            }
            onPointerEnter={preloadTextEditor}
            onFocus={preloadTextEditor}
            testId="viewer-edit-text"
          />
        ),
      },
      ...(reviewAvailable
        ? [
            {
              id: "viewer-review-accessibility",
              tooltip: reviewLabel,
              ariaLabel: reviewLabel,
              section: "middle" as const,
              order: 50.5,
              render: ({ disabled }: { disabled?: boolean }) => (
                <BarButton
                  icon="universal-access"
                  label={reviewLabel}
                  tooltipPosition={tooltipPosition}
                  active={reviewing}
                  disabled={disabled}
                  onClick={() =>
                    reviewing ? reviewMode.requestClose() : startReview()
                  }
                  onPointerEnter={preloadTextEditor}
                  onFocus={preloadTextEditor}
                  testId="viewer-review-accessibility"
                />
              ),
            },
          ]
        : []),
      {
        id: "viewer-annotations",
        tooltip: isAnnotationsActive ? exitAnnotationsLabel : annotationsLabel,
        ariaLabel: isAnnotationsActive
          ? exitAnnotationsLabel
          : annotationsLabel,
        section: "middle" as const,
        order: 51,
        active: isAnnotationsActive,
        render: ({ disabled }) => (
          <BarButton
            icon="pencil"
            label={annotationsLabel}
            hint={isAnnotationsActive ? exitAnnotationsLabel : undefined}
            tooltipPosition={tooltipPosition}
            active={isAnnotationsActive}
            disabled={disabled}
            onClick={() => {
              if (isAnnotationsActive) {
                // The tool's own exit path, so pending annotations get the
                // same save warning Form Editor has always shown.
                handleBackToTools();
                return;
              }
              if (pendingCount > 0 || redactionsApplied) {
                // The redaction warning answers the save question, so the
                // forced selection here avoids a second modal.
                requestNavigation(() => handleToolSelectForced("annotate"));
              } else {
                handleToolSelect("annotate");
              }
            }}
            testId="annotations-toggle"
          />
        ),
      },
      {
        id: "viewer-annotation-controls",
        section: "middle" as const,
        order: 52,
        render: ({ disabled }) => (
          <ViewerAnnotationControls
            currentView="viewer"
            disabled={disabled}
            tooltipPosition={tooltipPosition}
          />
        ),
      },
      {
        id: "viewer-form-fill",
        tooltip: formFillLabel,
        ariaLabel: formFillLabel,
        section: "middle" as const,
        order: 53,
        render: ({ disabled }) => (
          <BarButton
            icon="clipboard-pen-line"
            label={formFillLabel}
            tooltipPosition={tooltipPosition}
            active={isFormFillActive}
            disabled={disabled}
            onClick={() =>
              isFormFillActive
                ? handleBackToTools()
                : handleToolSelect("formFill")
            }
          />
        ),
      },
      {
        id: "viewer-doc-menu",
        section: "row-end" as const,
        order: 60,
        render: ({ disabled }) => <ViewerDocumentMenu disabled={disabled} />,
      },
      // Not drawn in the bar, where the page bar holds them; registered for
      // reading mode's rail, which acts on them by id.
      ...(
        [
          {
            id: "viewer-rotate-left",
            disabled: pageToolActive,
            onClick: () => viewer.rotationActions.rotateBackward(),
          },
          {
            id: "viewer-rotate-right",
            disabled: pageToolActive,
            onClick: () => viewer.rotationActions.rotateForward(),
          },
        ] satisfies WorkbenchBarButtonWithAction[]
      ).map((button) => ({ ...button, visible: false })),
    ];

    return buttons;
  }, [
    t,
    i18n.language,
    viewer,
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
    thumbnailsLabel,
    bookmarksLabel,
    attachmentsLabel,
    layersLabel,
    commentsLabel,
    isCommentsSidebarVisible,
    toggleCommentsSidebar,
    isPhone,
    readerMode,
    pageViewLabel,
    annotationVisibilityLabel,
    preloadTextEditor,
    tooltipPosition,
    annotationsLabel,
    exitAnnotationsLabel,
    isAnnotationsActive,
    handleToolSelect,
    handleToolSelectForced,
    handleBackToTools,
    requestNavigation,
    redactionsApplied,
    pendingCount,
    redactionActiveType,
    formFillLabel,
    isFormFillActive,
    editTextLabel,
    reviewLabel,
    reviewing,
    startReview,
    startEditing,
    reviewAvailable,
    isTextEditActive,
    pageTool,
    pageToolActive,
    leaveTextEditThen,
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
