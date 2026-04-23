import { useMemo, useState, useEffect, useCallback } from "react";
import { ActionIcon, Slider, Popover, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@app/i18n";
import { useViewer } from "@app/contexts/ViewerContext";
import {
  useRightRailButtons,
  RightRailButtonWithAction,
} from "@app/hooks/useRightRailButtons";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { SearchInterface } from "@app/components/viewer/SearchInterface";
import ViewerAnnotationControls from "@app/components/shared/rightRail/ViewerAnnotationControls";
import { useSidebarContext } from "@app/contexts/SidebarContext";
import { useRightRailTooltipSide } from "@app/hooks/useRightRailTooltipSide";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  useNavigationState,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { BASE_PATH, withBasePath } from "@app/constants/app";
import { useRedaction, useRedactionMode } from "@app/contexts/RedactionContext";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import StraightenIcon from "@mui/icons-material/Straighten";
import LayersIcon from "@mui/icons-material/Layers";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import StopIcon from "@mui/icons-material/Stop";
import { useViewerReadAloud } from "@app/components/viewer/useViewerReadAloud";

export function useViewerRightRailButtons(
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
  const { position: tooltipPosition } = useRightRailTooltipSide(
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

  const stripBasePath = useCallback((path: string) => {
    if (BASE_PATH && path.startsWith(BASE_PATH)) {
      return path.slice(BASE_PATH.length) || "/";
    }
    return path;
  }, []);

  const isAnnotationsPath = useCallback(() => {
    const cleanPath = stripBasePath(window.location.pathname).toLowerCase();
    return cleanPath === "/annotations" || cleanPath.endsWith("/annotations");
  }, [stripBasePath]);

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

  const searchLabel = t("rightRail.search", "Search PDF");
  const panLabel = t("rightRail.panMode", "Pan Mode");
  const applyRedactionsLabel = t(
    "rightRail.applyRedactionsFirst",
    "Apply redactions first",
  );
  const rotateLeftLabel = t("rightRail.rotateLeft", "Rotate Left");
  const rotateRightLabel = t("rightRail.rotateRight", "Rotate Right");
  const sidebarLabel = t("rightRail.toggleSidebar", "Toggle Sidebar");
  const bookmarkLabel = t("rightRail.toggleBookmarks", "Toggle Bookmarks");
  const attachmentLabel = t(
    "rightRail.toggleAttachments",
    "Toggle Attachments",
  );
  const layersLabel = t("rightRail.toggleLayers", "Toggle Layers");
  const commentsLabel = t("rightRail.toggleComments", "Comments");
  const printLabel = t("rightRail.print", "Print PDF");
  const annotationsLabel = t("rightRail.annotations", "Annotations");
  const formFillLabel = t("rightRail.formFill", "Fill Form");
  const rulerLabel = t("rightRail.ruler", "Ruler / Measure");
  const readAloudLabel = t("rightRail.readAloud", "Read Aloud");
  const readAloudSpeedLabel = t("rightRail.readAloudSpeed", "Speed");

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

  const viewerButtons = useMemo<RightRailButtonWithAction[]>(() => {
    const buttons: RightRailButtonWithAction[] = [
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
                    variant="subtle"
                    radius="md"
                    className="right-rail-icon"
                    disabled={disabled}
                    aria-label={searchLabel}
                    onClick={viewer.searchInterfaceActions.toggle}
                  >
                    <LocalIcon icon="search" width="1.5rem" height="1.5rem" />
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
        icon: (
          <LocalIcon icon="pan-tool-rounded" width="1.5rem" height="1.5rem" />
        ),
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
          setIsPanning((prev) => !prev);
        },
      },
      {
        id: "viewer-ruler",
        icon: <StraightenIcon sx={{ fontSize: "1.5rem" }} />,
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
          }
        },
      },
      {
        id: "viewer-rotate-left",
        icon: <LocalIcon icon="rotate-left" width="1.5rem" height="1.5rem" />,
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
        icon: <LocalIcon icon="rotate-right" width="1.5rem" height="1.5rem" />,
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
        icon: <LocalIcon icon="view-list" width="1.5rem" height="1.5rem" />,
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
        icon: (
          <LocalIcon
            icon="bookmark-add-rounded"
            width="1.5rem"
            height="1.5rem"
          />
        ),
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
        icon: (
          <LocalIcon icon="attachment-rounded" width="1.5rem" height="1.5rem" />
        ),
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
              icon: <LayersIcon sx={{ fontSize: "1.5rem" }} />,
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
        icon: <LocalIcon icon="comment" width="1.5rem" height="1.5rem" />,
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
        id: "viewer-print",
        icon: <LocalIcon icon="print" width="1.5rem" height="1.5rem" />,
        tooltip: printLabel,
        ariaLabel: printLabel,
        section: "top" as const,
        order: 57,
        onClick: () => {
          viewer.printActions.print();
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
                    variant={isReadingAloud ? "filled" : "subtle"}
                    radius="md"
                    className="right-rail-icon"
                    disabled={
                      disabled ||
                      typeof window === "undefined" ||
                      !window.speechSynthesis
                    }
                    aria-label={readAloudLabel}
                    onClick={handleReadAloud}
                    color={isReadingAloud ? "blue" : undefined}
                  >
                    {isReadingAloud ? (
                      <StopIcon sx={{ fontSize: "1.5rem" }} />
                    ) : (
                      <VolumeUpIcon sx={{ fontSize: "1.5rem" }} />
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
                    label={t("rightRail.readAloudLanguage", "Language")}
                    placeholder={t(
                      "rightRail.selectLanguage",
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
              variant={isAnnotationsActive ? "filled" : "subtle"}
              radius="md"
              className="right-rail-icon"
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
              color={isAnnotationsActive ? "blue" : undefined}
            >
              <LocalIcon icon="edit" width="1.5rem" height="1.5rem" />
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
              variant={isFormFillActive ? "filled" : "subtle"}
              radius="md"
              className="right-rail-icon"
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
              color={isFormFillActive ? "blue" : undefined}
            >
              <TextFieldsIcon sx={{ fontSize: "1.5rem" }} />
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
    printLabel,
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

  useRightRailButtons(viewerButtons);
}
