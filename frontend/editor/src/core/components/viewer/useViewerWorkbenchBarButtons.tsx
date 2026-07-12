import { useMemo, useState, useEffect, useCallback } from "react";
import { Slider, Popover, Select } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@app/i18n";
import { useViewer } from "@app/contexts/ViewerContext";
import {
  useWorkbenchBarButtons,
  WorkbenchBarButtonWithAction,
} from "@app/hooks/useWorkbenchBarButtons";
import { Tooltip } from "@app/components/shared/Tooltip";
import { SearchInterface } from "@app/components/viewer/SearchInterface";
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
import TextFieldsIcon from "@mui/icons-material/TextFields";
import StraightenIcon from "@mui/icons-material/Straighten";
import LayersIcon from "@mui/icons-material/Layers";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import StopIcon from "@mui/icons-material/Stop";
import { useViewerReadAloud } from "@app/components/viewer/useViewerReadAloud";
import AttachmentRoundedIcon from "@mui/icons-material/AttachmentRounded";
import BookmarkAddRoundedIcon from "@mui/icons-material/BookmarkAddRounded";
import CommentIcon from "@mui/icons-material/Comment";
import EditIcon from "@mui/icons-material/Edit";
import PanToolRoundedIcon from "@mui/icons-material/PanToolRounded";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import SearchIcon from "@mui/icons-material/Search";
import ViewListIcon from "@mui/icons-material/ViewList";

export function useViewerWorkbenchBarButtons(
  isRulerActive?: boolean,
  setIsRulerActive?: (v: boolean) => void,
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
  const { sidebarRefs } = useSidebarContext();
  const { position: tooltipPosition } = useWorkbenchBarTooltipSide(
    sidebarRefs,
    12,
  );
  const { handleToolSelect, handleToolSelectForced, handleBackToTools } =
    useToolWorkflow();
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
  const rotateLeftLabel = t("workbenchBar.rotateLeft", "Rotate Left");
  const rotateRightLabel = t("workbenchBar.rotateRight", "Rotate Right");
  const sidebarLabel = t("workbenchBar.toggleSidebar", "Toggle Sidebar");
  const bookmarkLabel = t("workbenchBar.toggleBookmarks", "Toggle Bookmarks");
  const attachmentLabel = t(
    "workbenchBar.toggleAttachments",
    "Toggle Attachments",
  );
  const layersLabel = t("workbenchBar.toggleLayers", "Toggle Layers");
  const commentsLabel = t("workbenchBar.toggleComments", "Comments");
  const annotationsLabel = t("workbenchBar.annotations", "Annotations");
  const formFillLabel = t("workbenchBar.formFill", "Fill Form");
  const rulerLabel = t("workbenchBar.ruler", "Ruler / Measure");
  const readAloudLabel = t("workbenchBar.readAloud", "Read Aloud");
  const readAloudSpeedLabel = t("workbenchBar.readAloudSpeed", "Speed");

  const isFormFillActive = (selectedTool as string) === "formFill";

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
    const buttons: WorkbenchBarButtonWithAction[] = [
      {
        id: "viewer-search",
        tooltip: searchLabel,
        ariaLabel: searchLabel,
        section: "top" as const,
        order: 10,
        render: ({ disabled }) => (
          <Tooltip
            content={searchLabel}
            position={tooltipPosition}
            offset={12}
            arrow
            portalTarget={document.body}
          >
            <Popover
              position={tooltipPosition}
              withArrow
              shadow="md"
              offset={8}
              opened={isSearchInterfaceVisible}
              onClose={viewer.searchInterfaceActions.close}
            >
              <Popover.Target>
                <div style={{ display: "inline-flex" }}>
                  <ActionIcon
                    variant="tertiary"
                    className="workbench-bar-action-icon"
                    disabled={disabled}
                    aria-label={searchLabel}
                    onClick={viewer.searchInterfaceActions.toggle}
                  >
                    <SearchIcon width="1rem" height="1rem" />
                  </ActionIcon>
                </div>
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
          </Tooltip>
        ),
      },
      {
        id: "viewer-pan-mode",
        icon: <PanToolRoundedIcon width="1rem" height="1rem" />,
        tooltip:
          !isPanning && pendingCount > 0 && redactionActiveType !== null
            ? applyRedactionsLabel
            : panLabel,
        ariaLabel:
          !isPanning && pendingCount > 0 && redactionActiveType !== null
            ? applyRedactionsLabel
            : panLabel,
        section: "top" as const,
        order: 20,
        active: isPanning,
        disabled:
          !isPanning && pendingCount > 0 && redactionActiveType !== null,
        onClick: () => {
          viewer.panActions.togglePan();
          setIsPanning((prev) => {
            const next = !prev;
            if (next && isRulerActive) setIsRulerActive?.(false);
            return next;
          });
        },
      },
      {
        id: "viewer-ruler",
        icon: <StraightenIcon sx={{ fontSize: "1rem" }} />,
        tooltip: rulerLabel,
        ariaLabel: rulerLabel,
        section: "top" as const,
        order: 25,
        active: Boolean(isRulerActive),
        onClick: () => {
          const next = !isRulerActive;
          setIsRulerActive?.(next);
          if (next && isPanning) {
            viewer.panActions.disablePan();
            setIsPanning(false);
          }
        },
      },
      {
        id: "viewer-rotate-left",
        icon: <RotateLeftIcon width="1rem" height="1rem" />,
        tooltip: rotateLeftLabel,
        ariaLabel: rotateLeftLabel,
        section: "top" as const,
        order: 30,
        onClick: () => {
          viewer.rotationActions.rotateBackward();
        },
      },
      {
        id: "viewer-rotate-right",
        icon: <RotateRightIcon width="1rem" height="1rem" />,
        tooltip: rotateRightLabel,
        ariaLabel: rotateRightLabel,
        section: "top" as const,
        order: 40,
        onClick: () => {
          viewer.rotationActions.rotateForward();
        },
      },
      {
        id: "viewer-toggle-sidebar",
        icon: <ViewListIcon width="1rem" height="1rem" />,
        tooltip: sidebarLabel,
        ariaLabel: sidebarLabel,
        section: "top" as const,
        order: 50,
        active: isThumbnailSidebarVisible,
        onClick: () => {
          viewer.toggleThumbnailSidebar();
        },
      },
      {
        id: "viewer-toggle-bookmarks",
        icon: <BookmarkAddRoundedIcon width="1.25rem" height="1.25rem" />,
        tooltip: bookmarkLabel,
        ariaLabel: bookmarkLabel,
        section: "top" as const,
        order: 55,
        active: isBookmarkSidebarVisible,
        onClick: () => {
          viewer.toggleBookmarkSidebar();
        },
      },
      {
        id: "viewer-toggle-attachments",
        icon: <AttachmentRoundedIcon width="1.25rem" height="1.25rem" />,
        tooltip: attachmentLabel,
        ariaLabel: attachmentLabel,
        section: "top" as const,
        order: 56,
        active: isAttachmentSidebarVisible,
        onClick: () => {
          viewer.toggleAttachmentSidebar();
        },
      },
      ...(hasLayers
        ? [
            {
              id: "viewer-toggle-layers",
              icon: <LayersIcon sx={{ fontSize: "1rem" }} />,
              tooltip: layersLabel,
              ariaLabel: layersLabel,
              section: "top" as const,
              order: 56.3,
              active: isLayerSidebarVisible,
              onClick: () => {
                viewer.toggleLayerSidebar();
              },
            },
          ]
        : []),
      {
        id: "viewer-toggle-comments",
        icon: <CommentIcon width="1rem" height="1rem" />,
        tooltip: commentsLabel,
        ariaLabel: commentsLabel,
        section: "top" as const,
        order: 56.5,
        active: isCommentsSidebarVisible,
        onClick: () => {
          toggleCommentsSidebar();
        },
      },
      {
        id: "viewer-read-aloud",
        tooltip: readAloudLabel,
        ariaLabel: readAloudLabel,
        section: "top" as const,
        order: 57,
        active: isReadingAloud,
        render: ({ disabled }) => (
          <Popover
            position={tooltipPosition}
            withArrow
            shadow="md"
            offset={8}
            opened={isReadingAloud}
            onClose={() => {}}
            withinPortal
          >
            <Popover.Target>
              <div style={{ display: "inline-flex" }}>
                <Tooltip
                  content={readAloudLabel}
                  position={tooltipPosition}
                  offset={12}
                  arrow
                  portalTarget={document.body}
                >
                  <ActionIcon
                    variant={isReadingAloud ? "primary" : "tertiary"}
                    className="workbench-bar-action-icon"
                    disabled={
                      disabled ||
                      typeof window === "undefined" ||
                      !window.speechSynthesis
                    }
                    aria-label={readAloudLabel}
                    onClick={handleReadAloud}
                  >
                    {isReadingAloud ? (
                      <StopIcon sx={{ fontSize: "1rem" }} />
                    ) : (
                      <VolumeUpIcon sx={{ fontSize: "1rem" }} />
                    )}
                  </ActionIcon>
                </Tooltip>
              </div>
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
        id: "viewer-annotations",
        tooltip: annotationsLabel,
        ariaLabel: annotationsLabel,
        section: "top" as const,
        order: 58,
        active: isAnnotationsActive,
        render: ({ disabled }) => (
          <Tooltip
            content={annotationsLabel}
            position={tooltipPosition}
            offset={12}
            arrow
            portalTarget={document.body}
          >
            <ActionIcon
              variant={isAnnotationsActive ? "primary" : "tertiary"}
              className="workbench-bar-action-icon"
              onClick={() => {
                if (disabled || isAnnotationsActive) return;

                const hasRedactionChanges =
                  pendingCount > 0 || redactionsApplied;

                const switchToAnnotations = () => {
                  const targetPath = withBasePath("/annotations");
                  if (window.location.pathname !== targetPath) {
                    window.history.pushState(null, "", targetPath);
                  }
                  setIsAnnotationsActive(true);
                  // Use handleToolSelectForced to bypass the unsaved-changes guard —
                  // the navigation warning modal already handled that check.
                  handleToolSelectForced("annotate");
                };

                if (hasRedactionChanges) {
                  requestNavigation(switchToAnnotations);
                } else {
                  switchToAnnotations();
                }
              }}
              disabled={disabled}
              aria-pressed={isAnnotationsActive}
              aria-label={annotationsLabel}
            >
              <EditIcon width="1rem" height="1rem" />
            </ActionIcon>
          </Tooltip>
        ),
      },
      {
        id: "viewer-annotation-controls",
        section: "top" as const,
        order: 60,
        render: ({ disabled }) => (
          <ViewerAnnotationControls currentView="viewer" disabled={disabled} />
        ),
      },
      {
        id: "viewer-form-fill",
        tooltip: formFillLabel,
        ariaLabel: formFillLabel,
        section: "top" as const,
        order: 62,
        render: ({ disabled }) => (
          <Tooltip
            content={formFillLabel}
            position={tooltipPosition}
            offset={12}
            arrow
            portalTarget={document.body}
          >
            <ActionIcon
              variant={isFormFillActive ? "primary" : "tertiary"}
              className="workbench-bar-action-icon"
              onClick={() => {
                if (disabled) return;
                if (isFormFillActive) {
                  handleBackToTools();
                } else {
                  handleToolSelect("formFill" as any);
                }
              }}
              disabled={disabled}
              aria-pressed={isFormFillActive}
              aria-label={formFillLabel}
            >
              <TextFieldsIcon sx={{ fontSize: "1rem" }} />
            </ActionIcon>
          </Tooltip>
        ),
      },
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
    rotateLeftLabel,
    rotateRightLabel,
    sidebarLabel,
    bookmarkLabel,
    attachmentLabel,
    layersLabel,
    tooltipPosition,
    annotationsLabel,
    isAnnotationsActive,
    handleToolSelect,
    pendingCount,
    redactionActiveType,
    formFillLabel,
    isFormFillActive,
    rulerLabel,
    isRulerActive,
    setIsRulerActive,
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
