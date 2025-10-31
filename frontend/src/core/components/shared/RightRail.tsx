import React, { useCallback, useMemo } from 'react';
import { ActionIcon, Divider } from '@mantine/core';
import '@app/components/shared/rightRail/RightRail.css';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useRightRail } from '@app/contexts/RightRailContext';
import { useFileState, useFileSelection } from '@app/contexts/FileContext';
import { useNavigationState } from '@app/contexts/NavigationContext';
import { useTranslation } from 'react-i18next';

import LanguageSelector from '@app/components/shared/LanguageSelector';
import { useRainbowThemeContext } from '@app/components/shared/RainbowThemeProvider';
import { Tooltip } from '@app/components/shared/Tooltip';
import { ViewerContext } from '@app/contexts/ViewerContext';
import { useSignature } from '@app/contexts/SignatureContext';
import LocalIcon from '@app/components/shared/LocalIcon';
import { RightRailFooterExtensions } from '@app/components/rightRail/RightRailFooterExtensions';

import { useSidebarContext } from '@app/contexts/SidebarContext';
import { RightRailButtonConfig, RightRailRenderContext, RightRailSection } from '@app/types/rightRail';

const SECTION_ORDER: RightRailSection[] = ['top', 'middle', 'bottom'];

function renderWithTooltip(
  node: React.ReactNode,
  tooltip: React.ReactNode | undefined
) {
  if (!tooltip) return node;

  const portalTarget = typeof document !== 'undefined' ? document.body : undefined;

  return (
    <Tooltip content={tooltip} position="left" offset={12} arrow portalTarget={portalTarget}>
      <div className="right-rail-tooltip-wrapper">{node}</div>
    </Tooltip>
  );
}

export default function RightRail() {
  const { sidebarRefs } = useSidebarContext();
  const { t } = useTranslation();
  const viewerContext = React.useContext(ViewerContext);
  const { toggleTheme } = useRainbowThemeContext();
  const { buttons, actions, allButtonsDisabled } = useRightRail();

  const { pageEditorFunctions, toolPanelMode, leftPanelView } = useToolWorkflow();
  const disableForFullscreen = toolPanelMode === 'fullscreen' && leftPanelView === 'toolPicker';

  const { workbench: currentView } = useNavigationState();

  const { selectors } = useFileState();
  const { selectedFiles, selectedFileIds } = useFileSelection();
  const { signaturesApplied } = useSignature();

  const activeFiles = selectors.getFiles();
  const pageEditorTotalPages = pageEditorFunctions?.totalPages ?? 0;
  const pageEditorSelectedCount = pageEditorFunctions?.selectedPageIds?.length ?? 0;
  const exportState = viewerContext?.getExportState?.();

  const totalItems = useMemo(() => {
    if (currentView === 'pageEditor') return pageEditorTotalPages;
    return activeFiles.length;
  }, [currentView, pageEditorTotalPages, activeFiles.length]);

  const selectedCount = useMemo(() => {
    if (currentView === 'pageEditor') {
      return pageEditorSelectedCount;
    }
    return selectedFileIds.length;
  }, [currentView, pageEditorSelectedCount, selectedFileIds.length]);

  const sectionsWithButtons = useMemo(() => {
    return SECTION_ORDER
      .map(section => {
        const sectionButtons = buttons.filter(btn => (btn.section ?? 'top') === section && (btn.visible ?? true));
        return { section, buttons: sectionButtons };
      })
      .filter(entry => entry.buttons.length > 0);
  }, [buttons]);

  const renderButton = useCallback(
    (btn: RightRailButtonConfig) => {
      const action = actions[btn.id];
      const disabled = Boolean(btn.disabled || allButtonsDisabled || disableForFullscreen);

      const triggerAction = () => {
        if (!disabled) action?.();
      };

      if (btn.render) {
        const context: RightRailRenderContext = {
          id: btn.id,
          disabled,
          allButtonsDisabled,
          action,
          triggerAction,
        };
        return btn.render(context) ?? null;
      }

      if (!btn.icon) return null;

      const ariaLabel =
        btn.ariaLabel || (typeof btn.tooltip === 'string' ? (btn.tooltip as string) : undefined);
      const className = ['right-rail-icon', btn.className].filter(Boolean).join(' ');
      const buttonNode = (
        <ActionIcon
          variant="subtle"
          radius="md"
          className={className}
          onClick={triggerAction}
          disabled={disabled}
          aria-label={ariaLabel}
        >
          {btn.icon}
        </ActionIcon>
      );

      return renderWithTooltip(buttonNode, btn.tooltip);
    },
    [actions, allButtonsDisabled, disableForFullscreen]
  );

  const handleExportAll = useCallback(async () => {
    if (currentView === 'viewer') {
      if (!signaturesApplied) {
        alert('You have unapplied signatures. Please use "Apply Signatures" first before exporting.');
        return;
      }
      viewerContext?.exportActions?.download();
      return;
    }

    if (currentView === 'pageEditor') {
      pageEditorFunctions?.onExportAll?.();
      return;
    }

    const filesToDownload = selectedFiles.length > 0 ? selectedFiles : activeFiles;
    filesToDownload.forEach(file => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    });
  }, [
    currentView,
    selectedFiles,
    activeFiles,
    pageEditorFunctions,
    viewerContext,
    signaturesApplied
  ]);

  const downloadTooltip = useMemo(() => {
    if (currentView === 'pageEditor') {
      return t('rightRail.exportAll', 'Export PDF');
    }
    if (selectedCount > 0) {
      return t('rightRail.downloadSelected', 'Download Selected Files');
    }
    return t('rightRail.downloadAll', 'Download All');
  }, [currentView, selectedCount, t]);

  return (
    <div ref={sidebarRefs.rightRailRef} className="right-rail" data-sidebar="right-rail">
      <div className="right-rail-inner">
        {sectionsWithButtons.map(({ section, buttons: sectionButtons }) => (
          <React.Fragment key={section}>
            <div className="right-rail-section" data-tour="right-rail-controls">
              {sectionButtons.map((btn, index) => {
                const content = renderButton(btn);
                if (!content) return null;
                return (
                  <div
                    key={btn.id}
                    className="right-rail-button-wrapper"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
            <Divider className="right-rail-divider" />
          </React.Fragment>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }} data-tour="right-rail-settings">
          {renderWithTooltip(
            <ActionIcon
              variant="subtle"
              radius="md"
              className="right-rail-icon"
              onClick={toggleTheme}
            >
              <LocalIcon icon="contrast" width="1.5rem" height="1.5rem" />
            </ActionIcon>,
            t('rightRail.toggleTheme', 'Toggle Theme')
          )}

          {renderWithTooltip(
            <div style={{ display: 'inline-flex' }}>
              <LanguageSelector position="left-start" offset={6} compact />
            </div>,
            t('rightRail.language', 'Language')
          )}

          {renderWithTooltip(
            <ActionIcon
              variant="subtle"
              radius="md"
              className="right-rail-icon"
              onClick={handleExportAll}
              disabled={
                disableForFullscreen ||
                (currentView === 'viewer' ? !exportState?.canExport : totalItems === 0 || allButtonsDisabled)
              }
            >
              <LocalIcon icon="download" width="1.5rem" height="1.5rem" />
            </ActionIcon>,
            downloadTooltip
          )}
        </div>

        <div className="right-rail-spacer" />

        <RightRailFooterExtensions className="right-rail-footer" />
      </div>
    </div>
  );
}
