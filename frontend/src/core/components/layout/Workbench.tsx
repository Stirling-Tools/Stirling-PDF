import { Box } from '@mantine/core';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import { useRainbowThemeContext } from '@app/components/shared/RainbowThemeProvider';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useFileHandler } from '@app/hooks/useFileHandler';
import { useFileState } from '@app/contexts/FileContext';
import { useNavigationState, useNavigationActions } from '@app/contexts/NavigationContext';
import { BaseWorkbenchType, isBaseWorkbench } from '@app/types/workbench';
import { useViewer } from '@app/contexts/ViewerContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import styles from '@app/components/layout/Workbench.module.css';

import TopControls from '@app/components/shared/TopControls';
import FileEditor from '@app/components/fileEditor/FileEditor';
import PageEditor from '@app/components/pageEditor/PageEditor';
import PageEditorControls from '@app/components/pageEditor/PageEditorControls';
import Viewer from '@app/components/viewer/Viewer';
import LandingPage from '@app/components/shared/LandingPage';
import Footer from '@app/components/shared/Footer';
import DismissAllErrorsButton from '@app/components/shared/DismissAllErrorsButton';

type TransitionAnimation =
  | 'viewerToPageEditor'
  | 'pageEditorToViewer'
  | 'pageEditorToFileEditor'
  | 'fileEditorToPageEditor';

type OverlayPage = {
  id: string;
  style: CSSProperties;
  hasThumbnail: boolean;
};

type Placement = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity?: number;
};

const clampCount = (count: number) => Math.max(6, Math.min(count, 12));

const createGridTargets = (count: number): Placement[] => {
  const placements: Placement[] = [];
  const columns = 3;
  const columnSpacing = 14;
  const rowSpacing = 18;
  const centerOffset = (columns - 1) / 2;

  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = (column - centerOffset) * columnSpacing + (Math.random() - 0.5) * 4;
    const y = row * rowSpacing - 12 + (Math.random() - 0.5) * 4;

    placements.push({
      x,
      y,
      rotation: (Math.random() - 0.5) * 4,
      scale: 1,
    });
  }

  return placements;
};

const createScatterPlacements = (count: number, radiusX: number, radiusY: number, baseY = 0): Placement[] =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + Math.random() * 0.6;
    const distanceX = radiusX * (0.45 + Math.random() * 0.55);
    const distanceY = radiusY * (0.4 + Math.random() * 0.6);

    return {
      x: Math.cos(angle) * distanceX,
      y: baseY + Math.sin(angle) * distanceY,
      rotation: (Math.random() - 0.5) * 10,
      scale: 0.88 + Math.random() * 0.18,
    };
  });

const createStackPlacements = (count: number, fileCount: number): Placement[] => {
  const stacks = Math.min(Math.max(fileCount, 1), 4);
  const spread = stacks > 1 ? 26 / (stacks - 1) : 0;

  return Array.from({ length: count }, (_, index) => {
    const stackIndex = index % stacks;
    const layer = Math.floor(index / stacks);
    const baseX = (stackIndex - (stacks - 1) / 2) * spread + (Math.random() - 0.5) * 4;
    const baseY = 6 + layer * 2.6 + (Math.random() - 0.5) * 3;

    return {
      x: baseX,
      y: baseY,
      rotation: (Math.random() - 0.5) * 8,
      scale: 0.86 - Math.min(layer, 3) * 0.03,
      opacity: 0.9 - Math.min(layer, 3) * 0.08,
    };
  });
};

const createOverlayPages = (
  animation: TransitionAnimation,
  thumbnails: string[],
  fileCount: number,
): OverlayPage[] => {
  const usableThumbs = thumbnails.filter(Boolean);
  const count = clampCount(Math.max(usableThumbs.length, 8));
  const gridPlacements = createGridTargets(count);
  const viewerScatter = createScatterPlacements(count, 9, 6, -2);
  const expandedScatter = createScatterPlacements(count, 16, 12, 2);
  const stackPlacements = createStackPlacements(count, fileCount);

  const placementsByAnimation: Record<TransitionAnimation, { from: Placement[]; to: Placement[]; delayStep: number }> = {
    viewerToPageEditor: { from: viewerScatter, to: gridPlacements, delayStep: 32 },
    pageEditorToViewer: { from: gridPlacements, to: expandedScatter, delayStep: 28 },
    pageEditorToFileEditor: { from: gridPlacements, to: stackPlacements, delayStep: 30 },
    fileEditorToPageEditor: { from: stackPlacements, to: gridPlacements, delayStep: 28 },
  };

  const { from, to, delayStep } = placementsByAnimation[animation];

  return Array.from({ length: count }, (_, index) => {
    const thumbnail = usableThumbs[index] ?? usableThumbs[index % Math.max(usableThumbs.length, 1)];
    const fromPlacement = from[index];
    const toPlacement = to[index];

    const style: CSSProperties = {
      ['--from-x' as string]: `${fromPlacement.x}vw`,
      ['--from-y' as string]: `${fromPlacement.y}vh`,
      ['--from-scale' as string]: fromPlacement.scale.toString(),
      ['--from-rot' as string]: `${fromPlacement.rotation}deg`,
      ['--to-x' as string]: `${toPlacement.x}vw`,
      ['--to-y' as string]: `${toPlacement.y}vh`,
      ['--to-scale' as string]: toPlacement.scale.toString(),
      ['--to-rot' as string]: `${toPlacement.rotation}deg`,
      ['--to-opacity' as string]: (toPlacement.opacity ?? 1).toString(),
      animationDelay: `${delayStep * index}ms`,
      backgroundImage: thumbnail ? `url(${thumbnail})` : undefined,
    };

    return {
      id: `overlay-page-${index}`,
      style,
      hasThumbnail: Boolean(thumbnail),
    };
  });
};

// No props needed - component uses contexts directly
export default function Workbench() {
  const { isRainbowMode } = useRainbowThemeContext();
  const { config } = useAppConfig();

  // Use context-based hooks to eliminate all prop drilling
  const { selectors } = useFileState();
  const { workbench: currentView } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const setCurrentView = navActions.setWorkbench;

  const previousViewRef = useRef(currentView);
  const [overlayAnimation, setOverlayAnimation] = useState<TransitionAnimation | null>(null);
  const [overlayRunId, setOverlayRunId] = useState(0);
  const [overlayPages, setOverlayPages] = useState<OverlayPage[]>([]);
  const overlayThumbsRef = useRef<string[]>([]);
  const activeFiles = selectors.getFiles();
  const {
    previewFile,
    pageEditorFunctions,
    sidebarsVisible,
    setPreviewFile,
    setPageEditorFunctions,
    setSidebarsVisible,
    customWorkbenchViews,
  } = useToolWorkflow();

  const { handleToolSelect } = useToolWorkflow();

  // Get navigation state - this is the source of truth
  const { selectedTool: selectedToolId } = useNavigationState();

  // Get tool registry from context (instead of direct hook call)
  const { toolRegistry } = useToolWorkflow();
  const selectedTool = selectedToolId ? toolRegistry[selectedToolId] : null;
  const { addFiles } = useFileHandler();

  // Get active file index from ViewerContext
  const { activeFileIndex, setActiveFileIndex, getThumbnailAPI, getScrollState } = useViewer();

  useEffect(() => {
    const previousView = previousViewRef.current;

    if (previousView === currentView) {
      return;
    }

    let animation: TransitionAnimation | null = null;

    if (previousView === 'viewer' && currentView === 'pageEditor') {
      animation = 'viewerToPageEditor';
    } else if (previousView === 'pageEditor' && currentView === 'viewer') {
      animation = 'pageEditorToViewer';
    } else if (previousView === 'pageEditor' && currentView === 'fileEditor') {
      animation = 'pageEditorToFileEditor';
    } else if (previousView === 'fileEditor' && currentView === 'pageEditor') {
      animation = 'fileEditorToPageEditor';
    }

    setOverlayAnimation(animation);
    previousViewRef.current = currentView;

    if (animation) {
      setOverlayRunId((runId) => runId + 1);
      const timeout = setTimeout(() => setOverlayAnimation(null), 820);

      return () => clearTimeout(timeout);
    }
  }, [currentView]);

  useEffect(() => {
    if (!overlayAnimation) {
      return undefined;
    }

    let cancelled = false;
    const thumbnailApi = getThumbnailAPI();
    const { totalPages } = getScrollState();
    const pagesToRender = totalPages > 0 ? Math.min(totalPages, 12) : 8;

    const resetThumbnails = () => {
      overlayThumbsRef.current.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      overlayThumbsRef.current = [];
    };

    const loadThumbnails = async () => {
      resetThumbnails();

      if (!thumbnailApi || pagesToRender === 0) {
        setOverlayPages(createOverlayPages(overlayAnimation, [], activeFiles.length));
        return;
      }

      const promises = Array.from({ length: pagesToRender }, (_, index) =>
        thumbnailApi
          .renderThumb(index, 0.6)
          .toPromise()
          .then((blob: Blob) => URL.createObjectURL(blob))
          .catch(() => ''),
      );

      const thumbnailUrls = await Promise.all(promises);

      if (cancelled) {
        resetThumbnails();
        return;
      }

      overlayThumbsRef.current = thumbnailUrls.filter((url) => url.startsWith('blob:'));
      setOverlayPages(createOverlayPages(overlayAnimation, thumbnailUrls, activeFiles.length));
    };

    void loadThumbnails();

    return () => {
      cancelled = true;
    };
  }, [overlayAnimation, getScrollState, getThumbnailAPI, activeFiles.length]);

  useEffect(() => () => {
    overlayThumbsRef.current.forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  }, []);

  const handlePreviewClose = () => {
    setPreviewFile(null);
    const previousMode = sessionStorage.getItem('previousMode');
    if (previousMode === 'split') {
      // Use context's handleToolSelect which coordinates tool selection and view changes
      handleToolSelect('split');
      sessionStorage.removeItem('previousMode');
    } else if (previousMode === 'compress') {
      handleToolSelect('compress');
      sessionStorage.removeItem('previousMode');
    } else if (previousMode === 'convert') {
      handleToolSelect('convert');
      sessionStorage.removeItem('previousMode');
    } else {
      setCurrentView('fileEditor');
    }
  };

  const renderMainContent = () => {
    if (activeFiles.length === 0) {
      return (
        <LandingPage
        />
      );
    }

    switch (currentView) {
      case "fileEditor":

        return (
          <FileEditor
            toolMode={!!selectedToolId}
            supportedExtensions={selectedTool?.supportedFormats || ["pdf"]}
            {...(!selectedToolId && {
              onOpenPageEditor: () => {
                setCurrentView("pageEditor");
              },
              onMergeFiles: (filesToMerge) => {
                addFiles(filesToMerge);
                setCurrentView("viewer");
              }
            })}
          />
        );

      case "viewer":
        
        return (
          <Viewer
            sidebarsVisible={sidebarsVisible}
            setSidebarsVisible={setSidebarsVisible}
            previewFile={previewFile}
            onClose={handlePreviewClose}
            activeFileIndex={activeFileIndex}
            setActiveFileIndex={setActiveFileIndex}
          />
        );

      case "pageEditor":
        
        return (
          <>
            <PageEditor
              onFunctionsReady={setPageEditorFunctions}
            />
            {pageEditorFunctions && (
              <PageEditorControls
                onClosePdf={pageEditorFunctions.closePdf}
                onUndo={pageEditorFunctions.handleUndo}
                onRedo={pageEditorFunctions.handleRedo}
                canUndo={pageEditorFunctions.canUndo}
                canRedo={pageEditorFunctions.canRedo}
                onRotate={pageEditorFunctions.handleRotate}
                onDelete={pageEditorFunctions.handleDelete}
                onSplit={pageEditorFunctions.handleSplit}
                onSplitAll={pageEditorFunctions.handleSplitAll}
                onPageBreak={pageEditorFunctions.handlePageBreak}
                onPageBreakAll={pageEditorFunctions.handlePageBreakAll}
                onExportAll={pageEditorFunctions.onExportAll}
                exportLoading={pageEditorFunctions.exportLoading}
                selectionMode={pageEditorFunctions.selectionMode}
                selectedPageIds={pageEditorFunctions.selectedPageIds}
                displayDocument={pageEditorFunctions.displayDocument}
                splitPositions={pageEditorFunctions.splitPositions}
                totalPages={pageEditorFunctions.totalPages}
              />
            )}
          </>
        );

      default:
        if (!isBaseWorkbench(currentView)) {
          const customView = customWorkbenchViews.find((view) => view.workbenchId === currentView && view.data != null);
            
          
          if (customView) {
            const CustomComponent = customView.component;
            return <CustomComponent data={customView.data} />;
          }
        }
        return <LandingPage />;
    }
  };

  return (
    <Box
      className="flex-1 h-full min-w-0 relative flex flex-col"
      data-tour="workbench"
      style={
        isRainbowMode
          ? {} // No background color in rainbow mode
          : { backgroundColor: 'var(--bg-background)' }
      }
    >
      {/* Top Controls */}
      {activeFiles.length > 0 && (
        <TopControls
          currentView={currentView}
          setCurrentView={setCurrentView}
          customViews={customWorkbenchViews}
          activeFiles={activeFiles.map(f => {
            const stub = selectors.getStirlingFileStub(f.fileId);
            return { fileId: f.fileId, name: f.name, versionNumber: stub?.versionNumber };
          })}
          currentFileIndex={activeFileIndex}
          onFileSelect={setActiveFileIndex}
        />
      )}

      {/* Dismiss All Errors Button */}
      <DismissAllErrorsButton />

      {/* Main content area */}
      <Box
        className={`flex-1 min-h-0 relative z-10 ${styles.workbenchScrollable} ${styles.workbenchTransition}`}
      >
        {renderMainContent()}
        {overlayAnimation && overlayPages.length > 0 && (
          <div key={overlayRunId} className={`${styles.transitionOverlay} ${styles[overlayAnimation]}`}>
            {overlayPages.map((page) => (
              <span
                key={page.id}
                className={`${styles.transitionPage} ${!page.hasThumbnail ? styles.transitionPagePlaceholder : ''}`}
                style={page.style}
              />
            ))}
          </div>
        )}
      </Box>

      <Footer
        analyticsEnabled={config?.enableAnalytics === true}
        termsAndConditions={config?.termsAndConditions}
        privacyPolicy={config?.privacyPolicy}
        cookiePolicy={config?.cookiePolicy}
        impressum={config?.impressum}
        accessibilityStatement={config?.accessibilityStatement}
      />
    </Box>
  );
}
