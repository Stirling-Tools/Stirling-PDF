/**
 * Proprietary URL mappings.
 * This file overrides src/core/utils/urlMapping.ts
 * to add proprietary-specific URL mappings.
 */

import { ToolId } from '@app/types/toolId';
import { URL_TO_TOOL_MAP as CORE_URL_TO_TOOL_MAP } from '@core/utils/urlMapping';

// Proprietary URL mappings
const PROPRIETARY_URL_MAPPINGS: Record<string, ToolId> = {
  '/pdf-text-editor': 'pdfTextEditor',
};

// Merge core and proprietary mappings
export const URL_TO_TOOL_MAP: Record<string, ToolId> = {
  ...CORE_URL_TO_TOOL_MAP,
  ...PROPRIETARY_URL_MAPPINGS,
};
