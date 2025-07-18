import React, { useEffect, useMemo, useState } from "react";
import { Button, Stack, Text, SegmentedControl, NumberInput, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import DownloadIcon from "@mui/icons-material/Download";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";

import ToolStep, { ToolStepContainer } from "../components/tools/shared/ToolStep";
import OperationButton from "../components/tools/shared/OperationButton";
import ErrorNotification from "../components/tools/shared/ErrorNotification";
import FileStatusIndicator from "../components/tools/shared/FileStatusIndicator";
import ResultsPreview from "../components/tools/shared/ResultsPreview";

import { useCompressParameters } from "../hooks/tools/compress/useCompressParameters";
import { useCompressOperation } from "../hooks/tools/compress/useCompressOperation";

interface CompressProps {
  selectedFiles?: File[];
  onPreviewFile?: (file: File | null) => void;
}

const Compress = ({ selectedFiles = [], onPreviewFile }: CompressProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();

  const compressParams = useCompressParameters();
  const compressOperation = useCompressOperation();
  const [isSliding, setIsSliding] = useState(false);

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("compress-pdf");


  useEffect(() => {
    compressOperation.resetResults();
    onPreviewFile?.(null);
  }, [compressParams.parameters, selectedFiles]);

  const handleCompress = async () => {
    await compressOperation.executeOperation(
      compressParams.parameters,
      selectedFiles
    );
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'compress');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    compressOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('compress');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = compressOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = hasResults;

  const previewResults = useMemo(() =>
    compressOperation.files?.map((file, index) => ({
      file,
      thumbnail: compressOperation.thumbnails[index]
    })) || [],
    [compressOperation.files, compressOperation.thumbnails]
  );

  return (
    <ToolStepContainer>
      <Stack gap="md" h="100%" p="sm" style={{ overflow: 'auto' }}>


        {/* Files Step */}
        <ToolStep
          title="Files"
          isVisible={true}
          isCollapsed={filesCollapsed}
          isCompleted={filesCollapsed}
          completedMessage={hasFiles ? `Selected: ${selectedFiles[0]?.name}` : undefined}
        >
          <FileStatusIndicator
            selectedFiles={selectedFiles}
            placeholder="Select a PDF file in the main view to get started"
          />
        </ToolStep>

        {/* Settings Step */}
        <ToolStep
          title="Settings"
          isVisible={hasFiles}
          isCollapsed={settingsCollapsed}
          isCompleted={settingsCollapsed}
          onCollapsedClick={settingsCollapsed ? handleSettingsReset : undefined}
          completedMessage={settingsCollapsed ? "Compression completed" : undefined}
        >
          <Stack gap="md">
            {/* Compression Method */}
            <Stack gap="sm">
              <Text size="sm" fw={500}>Compression Method</Text>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Button
                  variant={compressParams.parameters.compressionMethod === 'quality' ? 'filled' : 'outline'}
                  color={compressParams.parameters.compressionMethod === 'quality' ? 'blue' : 'gray'}
                  onClick={() => compressParams.updateParameter('compressionMethod', 'quality')}
                  style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
                >
                  <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px', overflow: 'auto' }}>
                    Quality
                  </div>
                </Button>
                <Button
                  variant={compressParams.parameters.compressionMethod === 'filesize' ? 'filled' : 'outline'}
                  color={compressParams.parameters.compressionMethod === 'filesize' ? 'blue' : 'gray'}
                  onClick={() => compressParams.updateParameter('compressionMethod', 'filesize')}
                  style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
                >
                  <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
                    File Size
                  </div>
                </Button>
              </div>
            </Stack>

            {/* Quality Adjustment */}
            {compressParams.parameters.compressionMethod === 'quality' && (
              <Stack gap="sm">
                <Text size="sm" fw={500}>Compression Level</Text>
                <div style={{ position: 'relative' }}>
                  <input
                    type="range"
                    min="1"
                    max="9"
                    step="1"
                    value={compressParams.parameters.compressionLevel}
                    onChange={(e) => compressParams.updateParameter('compressionLevel', parseInt(e.target.value))}
                    onMouseDown={() => setIsSliding(true)}
                    onMouseUp={() => setIsSliding(false)}
                    onTouchStart={() => setIsSliding(true)}
                    onTouchEnd={() => setIsSliding(false)}
                    style={{ 
                      width: '100%',
                      height: '6px',
                      borderRadius: '3px',
                      background: `linear-gradient(to right, #228be6 0%, #228be6 ${(compressParams.parameters.compressionLevel - 1) / 8 * 100}%, #e9ecef ${(compressParams.parameters.compressionLevel - 1) / 8 * 100}%, #e9ecef 100%)`,
                      outline: 'none',
                      WebkitAppearance: 'none'
                    }}
                  />
                  {isSliding && (
                    <div style={{
                      position: 'absolute',
                      top: '-25px',
                      left: `${(compressParams.parameters.compressionLevel - 1) / 8 * 100}%`,
                      transform: 'translateX(-50%)',
                      background: '#f8f9fa',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '12px',
                      color: '#228be6',
                      whiteSpace: 'nowrap'
                    }}>
                      {compressParams.parameters.compressionLevel}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6c757d' }}>
                  <span>Min 1</span>
                  <span>Max 9</span>
                </div>
                <Text size="xs" c="dimmed" style={{ marginTop: '8px' }}>
                  {compressParams.parameters.compressionLevel <= 3 && "1-3 PDF compression"}
                  {compressParams.parameters.compressionLevel >= 4 && compressParams.parameters.compressionLevel <= 6 && "4-6 lite image compression"}
                  {compressParams.parameters.compressionLevel >= 7 && "7-9 intense image compression Will dramatically reduce image quality"}
                </Text>
              </Stack>
            )}

            {/* File Size Input */}
            {compressParams.parameters.compressionMethod === 'filesize' && (
              <Stack gap="sm">
                <Text size="sm" fw={500}>Desired File Size</Text>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <NumberInput
                    placeholder="Enter size"
                    value={compressParams.parameters.fileSizeValue}
                    onChange={(value) => compressParams.updateParameter('fileSizeValue', value?.toString() || '')}
                    min={0}
                    style={{ flex: 1 }}
                  />
                  <Select
                    value={compressParams.parameters.fileSizeUnit}
                    onChange={(value) => {
                      // Prevent deselection - if value is null/undefined, keep the current value
                      if (value) {
                        compressParams.updateParameter('fileSizeUnit', value as 'KB' | 'MB');
                      }
                    }}
                    data={[
                      { value: 'KB', label: 'KB' },
                      { value: 'MB', label: 'MB' }
                    ]}
                    style={{ width: '80px' }}
                  />
                </div>
              </Stack>
            )}

            {/* Compression Options */}
            <Stack gap="sm">
              <label 
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                title="Converts all images in the PDF to grayscale, which can significantly reduce file size while maintaining readability"
              >
                <input
                  type="checkbox"
                  checked={compressParams.parameters.grayscale}
                  onChange={(e) => compressParams.updateParameter('grayscale', e.target.checked)}
                />
                <Text size="sm">{t("compress.grayscale.label", "Apply Grayscale for compression")}</Text>
              </label>
            </Stack>

            <OperationButton
              onClick={handleCompress}
              isLoading={compressOperation.isLoading}
              disabled={!compressParams.validateParameters() || !endpointEnabled}
              loadingText={t("loading")}
              submitText="Compress and Review"
            />
          </Stack>
        </ToolStep>

        {/* Results Step */}
        <ToolStep
          title="Results"
          isVisible={hasResults}
        >
          <Stack gap="md">
            {compressOperation.status && (
              <Text size="sm" c="dimmed">{compressOperation.status}</Text>
            )}

            <ErrorNotification
              error={compressOperation.errorMessage}
              onClose={compressOperation.clearError}
            />

            {compressOperation.downloadUrl && (
              <Button
                component="a"
                href={compressOperation.downloadUrl}
                download={compressOperation.downloadFilename}
                leftSection={<DownloadIcon />}
                color="green"
                fullWidth
                mb="md"
              >
                {t("download", "Download")}
              </Button>
            )}

            <ResultsPreview
              files={previewResults}
              onFileClick={handleThumbnailClick}
              isGeneratingThumbnails={compressOperation.isGeneratingThumbnails}
              title="Compression Results"
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}

export default Compress;
