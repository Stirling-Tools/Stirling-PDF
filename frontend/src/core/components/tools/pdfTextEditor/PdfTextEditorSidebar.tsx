import React, { useCallback, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Flex,
  Group,
  Menu,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip as MantineTooltip,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import FileDownloadIcon from '@mui/icons-material/FileDownloadOutlined';

import { PdfTextEditorViewData, TextGroup } from '@app/tools/pdfTextEditor/pdfTextEditorTypes';
import { pageDimensions } from '@app/tools/pdfTextEditor/pdfTextEditorUtils';
import FontStatusPanel from '@app/components/tools/pdfTextEditor/FontStatusPanel';
import ToolStep, { ToolStepProvider } from '@app/components/tools/shared/ToolStep';
import { usePdfTextEditorTips } from '@app/components/tooltips/usePdfTextEditorTips';
import { Tooltip } from '@app/components/shared/Tooltip';
import LocalIcon from '@app/components/shared/LocalIcon';

type GroupingMode = 'auto' | 'paragraph' | 'singleLine';

interface PdfTextEditorSidebarProps {
  data: PdfTextEditorViewData;
}

// Analyze page content to determine if it's paragraph-heavy
const analyzePageContentType = (
  groups: TextGroup[],
  pageWidth: number,
): boolean => {
  if (groups.length < 3) {
    return false;
  }

  const widths = groups.map((g) => Math.max(g.bounds.right - g.bounds.left, 1));
  const avgWidth = widths.reduce((sum, w) => sum + w, 0) / widths.length;
  const stdDev = Math.sqrt(
    widths.reduce((sum, w) => sum + Math.pow(w - avgWidth, 2), 0) / widths.length,
  );
  const coefficientOfVariation = avgWidth > 0 ? stdDev / avgWidth : 0;
  const fullWidthRatio = widths.filter((w) => w > pageWidth * 0.65).length / widths.length;

  const criterion1 = groups.length >= 3;
  const criterion2 = avgWidth > pageWidth * 0.3;
  const criterion3 = coefficientOfVariation > 0.5 || fullWidthRatio > 0.6;

  return criterion1 && criterion2 && criterion3;
};

const PdfTextEditorSidebar = ({ data }: PdfTextEditorSidebarProps) => {
  const { t } = useTranslation();
  const [pendingModeChange, setPendingModeChange] = useState<GroupingMode | null>(null);
  const [advancedSettingsCollapsed, setAdvancedSettingsCollapsed] = useState(false);
  const [fontsCollapsed, setFontsCollapsed] = useState(false);
  const pdfTextEditorTips = usePdfTextEditorTips();

  const {
    document: pdfDocument,
    groupsByPage,
    hasDocument,
    hasChanges,
    fileName,
    isGeneratingPdf,
    isSavingToWorkbench,
    isConverting,
    forceSingleTextElement,
    groupingMode: externalGroupingMode,
    autoScaleText,
    selectedPage,
    onReset,
    onGeneratePdf,
    onSaveToWorkbench,
    onForceSingleTextElementChange,
    onGroupingModeChange,
    onAutoScaleTextChange,
  } = data;

  // Get page dimensions
  const pages = pdfDocument?.pages ?? [];
  const currentPage = pages[selectedPage] ?? null;
  const { width: pageWidth } = pageDimensions(currentPage);
  const pageGroups = groupsByPage[selectedPage] ?? [];

  // Detect if current page contains paragraph-heavy content
  const isParagraphPage = useMemo(() => {
    return analyzePageContentType(pageGroups, pageWidth);
  }, [pageGroups, pageWidth]);

  const handleModeChangeRequest = useCallback((newMode: GroupingMode) => {
    if (hasChanges && newMode !== externalGroupingMode) {
      setPendingModeChange(newMode);
    } else {
      onGroupingModeChange(newMode);
    }
  }, [hasChanges, externalGroupingMode, onGroupingModeChange]);

  const handleConfirmModeChange = useCallback(() => {
    if (pendingModeChange) {
      onGroupingModeChange(pendingModeChange);
      setPendingModeChange(null);
    }
  }, [pendingModeChange, onGroupingModeChange]);

  const handleCancelModeChange = useCallback(() => {
    setPendingModeChange(null);
  }, []);

  return (
    <>
      <Stack style={{ height: '100%', display: 'flex' }} gap={0}>
        <ScrollArea style={{ flex: 1 }} offsetScrollbars>
          <Stack gap="md">
            <Stack gap="xs" pl="md" pr={0} pt="md">
              {/* Title row with ALPHA badge and info tooltip */}
              <Flex align="center" justify="space-between">
                <Flex align="center" gap="xs">
                  <Text fw={600} size="sm">
                    {t('pdfTextEditor.title', 'PDF Text Editor')}
                  </Text>
                  <Badge size="xs" variant="light" color="orange">
                    {t('toolPanel.alpha', 'Alpha')}
                  </Badge>
                </Flex>
                <Tooltip
                  sidebarTooltip={true}
                  tips={pdfTextEditorTips.tips}
                  header={pdfTextEditorTips.header}
                  pinOnClick
                >
                  <ActionIcon variant="subtle" color="blue" size="sm">
                    <LocalIcon icon="info-outline-rounded" width="1.25rem" height="1.25rem" />
                  </ActionIcon>
                </Tooltip>
              </Flex>

              {fileName && (
                <Text size="sm" c="dimmed">
                  {t('pdfTextEditor.currentFile', 'Current file: {{name}}', { name: fileName })}
                </Text>
              )}
            </Stack>

            <ToolStep
              title={t('pdfTextEditor.options.advanced.title', 'Advanced Settings')}
              isCollapsed={advancedSettingsCollapsed}
              onCollapsedClick={() => setAdvancedSettingsCollapsed(!advancedSettingsCollapsed)}
            >
              <Stack gap="md">
                <Divider />
                <Group justify="space-between" align="center">
                  <Group gap={4} align="center" style={{ flex: 1, minWidth: 0 }}>
                    <Tooltip
                      sidebarTooltip={false}
                      content={t(
                        'pdfTextEditor.options.autoScaleText.description',
                        'Automatically scales text horizontally to fit within its original bounding box when font rendering differs from PDF.'
                      )}
                      position="top"
                    >
                      <ActionIcon variant="subtle" color="gray" size="sm" style={{ flexShrink: 0 }}>
                        <InfoOutlinedIcon fontSize="small" />
                      </ActionIcon>
                    </Tooltip>
                    <Text fw={500} size="sm" style={{ flex: 1 }}>
                      {t('pdfTextEditor.options.autoScaleText.title', 'Auto-scale text to fit boxes')}
                    </Text>
                  </Group>
                  <Switch
                    size="md"
                    checked={autoScaleText}
                    onChange={(event) => onAutoScaleTextChange(event.currentTarget.checked)}
                  />
                </Group>

                <Divider />

                <Stack gap="xs">
                  <Group gap={4} align="center">
                    <Text fw={500} size="sm">
                      {t('pdfTextEditor.options.groupingMode.title', 'Text Grouping Mode')}
                    </Text>
                    {externalGroupingMode === 'auto' && isParagraphPage && (
                      <Badge size="xs" color="blue" variant="light" key={`para-${selectedPage}`}>
                        {t('pdfTextEditor.pageType.paragraph', 'Paragraph page')}
                      </Badge>
                    )}
                    {externalGroupingMode === 'auto' && !isParagraphPage && hasDocument && (
                      <Badge size="xs" color="gray" variant="light" key={`sparse-${selectedPage}`}>
                        {t('pdfTextEditor.pageType.sparse', 'Sparse text')}
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {externalGroupingMode === 'auto'
                      ? t(
                          'pdfTextEditor.options.groupingMode.autoDescription',
                          'Automatically detects page type and groups text appropriately.'
                        )
                      : externalGroupingMode === 'paragraph'
                        ? t(
                            'pdfTextEditor.options.groupingMode.paragraphDescription',
                            'Groups aligned lines into multi-line paragraph text boxes.'
                          )
                        : t(
                            'pdfTextEditor.options.groupingMode.singleLineDescription',
                            'Keeps each PDF text line as a separate text box.'
                          )}
                  </Text>
                  <SegmentedControl
                    value={externalGroupingMode}
                    onChange={(value) => handleModeChangeRequest(value as GroupingMode)}
                    data={[
                      { label: t('pdfTextEditor.groupingMode.auto', 'Auto'), value: 'auto' },
                      { label: t('pdfTextEditor.groupingMode.paragraph', 'Paragraph'), value: 'paragraph' },
                      { label: t('pdfTextEditor.groupingMode.singleLine', 'Single Line'), value: 'singleLine' },
                    ]}
                    fullWidth
                  />
                </Stack>

                <Divider />

                <Group justify="space-between" align="center">
                  <Group gap={4} align="center" style={{ flex: 1, minWidth: 0 }}>
                    <Tooltip
                      sidebarTooltip={false}
                      content={t(
                        'pdfTextEditor.options.forceSingleElement.description',
                        'When enabled, the editor exports each edited text box as one PDF text element to avoid overlapping glyphs or mixed fonts.'
                      )}
                      position="top"
                    >
                      <ActionIcon variant="subtle" color="gray" size="sm" style={{ flexShrink: 0 }}>
                        <InfoOutlinedIcon fontSize="small" />
                      </ActionIcon>
                    </Tooltip>
                    <Text fw={500} size="sm" style={{ flex: 1 }}>
                      {t('pdfTextEditor.options.forceSingleElement.title', 'Lock edited text to a single PDF element')}
                    </Text>
                  </Group>
                  <Switch
                    size="md"
                    checked={forceSingleTextElement}
                    onChange={(event) => onForceSingleTextElementChange(event.currentTarget.checked)}
                  />
                </Group>
              </Stack>
            </ToolStep>

            {hasDocument && (
              <FontStatusPanel
                document={pdfDocument}
                pageIndex={selectedPage}
                isCollapsed={fontsCollapsed}
                onCollapsedChange={setFontsCollapsed}
              />
            )}
          </Stack>
        </ScrollArea>

        <Group gap="xs" wrap="nowrap" p="md">
            <Button
              variant="filled"
              onClick={onSaveToWorkbench}
              loading={isSavingToWorkbench}
              disabled={!hasDocument || !hasChanges || isConverting}
              style={{ flex: 1 }}
            >
              {t('pdfTextEditor.actions.applyChanges', 'Apply Changes')}
            </Button>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="default"
                size="lg"
                disabled={!hasDocument || isConverting}
              >
                <MoreHorizIcon fontSize="small" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<FileDownloadIcon fontSize="small" />}
                onClick={() => onGeneratePdf()}
                disabled={!hasChanges || isGeneratingPdf}
              >
                {t('pdfTextEditor.actions.downloadCopy', 'Download Copy')}
              </Menu.Item>
              <Menu.Item
                leftSection={<AutorenewIcon fontSize="small" />}
                onClick={onReset}
                color="red"
              >
                {t('pdfTextEditor.actions.reset', 'Reset Changes')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Stack>

      {/* Mode Change Confirmation Modal */}
      <Modal
        opened={pendingModeChange !== null}
        onClose={handleCancelModeChange}
        title={t('pdfTextEditor.modeChange.title', 'Confirm Mode Change')}
        centered
      >
        <Stack gap="md">
          <Text>
            {t(
              'pdfTextEditor.modeChange.warning',
              'Changing the text grouping mode will reset all unsaved changes. Are you sure you want to continue?'
            )}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={handleCancelModeChange}>
              {t('pdfTextEditor.modeChange.cancel', 'Cancel')}
            </Button>
            <Button color="red" onClick={handleConfirmModeChange}>
              {t('pdfTextEditor.modeChange.confirm', 'Reset and Change Mode')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};

export default PdfTextEditorSidebar;
