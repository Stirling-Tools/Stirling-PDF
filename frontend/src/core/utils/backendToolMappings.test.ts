import { describe, expect, it } from 'vitest';
import { compressOperationConfig } from '@app/hooks/tools/compress/useCompressOperation';
import { rotateOperationConfig } from '@app/hooks/tools/rotate/useRotateOperation';
import { mergeOperationConfig } from '@app/hooks/tools/merge/useMergeOperation';
import { addWatermarkOperationConfig } from '@app/hooks/tools/addWatermark/useAddWatermarkOperation';
import { getBackendMappedToolOperation, isBackendOperationSupported } from '@app/utils/backendToolMappings';
import { ToolRegistry } from '@app/data/toolsTaxonomy';

const mappedRegistry = {
  compress: { operationConfig: compressOperationConfig },
  rotate: { operationConfig: rotateOperationConfig },
  merge: { operationConfig: mergeOperationConfig },
  watermark: { operationConfig: addWatermarkOperationConfig },
} as Partial<ToolRegistry>;

describe('backendToolMappings', () => {
  it('finds a mapped tool operation by backend operation id', () => {
    const mappedTool = getBackendMappedToolOperation(mappedRegistry, 'rotatePDF');

    expect(mappedTool?.toolId).toBe('rotate');
    expect(mappedTool?.backendMapping.operationId).toBe('rotatePDF');
  });

  it('returns null for unmapped backend operations', () => {
    expect(getBackendMappedToolOperation(mappedRegistry, 'flatten')).toBeNull();
    expect(isBackendOperationSupported(mappedRegistry, 'flatten')).toBe(false);
  });

  it('round-trips compress parameters through the backend mapper', () => {
    const params = {
      ...compressOperationConfig.defaultParameters,
      compressionMethod: 'filesize' as const,
      fileSizeValue: '25',
      fileSizeUnit: 'MB' as const,
      grayscale: true,
      lineArt: true,
      lineArtThreshold: 72,
      lineArtEdgeLevel: 2 as const,
      linearize: true,
    };

    const apiParams = compressOperationConfig.backendMapping?.toApiParams(params);
    const roundTripped = compressOperationConfig.backendMapping?.toFrontendParameters(apiParams);

    expect(apiParams).toMatchObject({
      expectedOutputSize: '25MB',
      grayscale: true,
      lineArt: true,
      lineArtThreshold: 72,
      lineArtEdgeLevel: 2,
      linearize: true,
      normalize: false,
    });
    expect(roundTripped).toMatchObject({
      compressionMethod: 'filesize',
      fileSizeValue: '25',
      fileSizeUnit: 'MB',
      grayscale: true,
      lineArt: true,
      lineArtThreshold: 72,
      lineArtEdgeLevel: 2,
      linearize: true,
    });
  });

  it('fails closed for unsupported frontend merge sorting modes', () => {
    expect(() =>
      mergeOperationConfig.backendMapping?.toFrontendParameters({
        sortType: 'byFileName',
        removeCertSign: false,
      })
    ).toThrow('Unsupported merge sortType');
  });

  it('fails closed for watermark image plans without a watermark file', () => {
    expect(() =>
      addWatermarkOperationConfig.backendMapping?.toFrontendParameters({
        watermarkType: 'image',
        watermarkText: '',
        fontSize: 12,
        rotation: 0,
        opacity: 0.5,
        widthSpacer: 50,
        heightSpacer: 50,
        alphabet: 'roman',
        customColor: '#d3d3d3',
        convertPDFToImage: false,
      })
    ).toThrow('Watermark image requests require a watermarkImage file');
  });
});
