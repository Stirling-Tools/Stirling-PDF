import { TFunction } from 'i18next';
import { ToolId } from '@app/types/toolId';
import { ToolRegistryEntry } from '@app/data/toolsTaxonomy';
import { SubToolEntry } from '@app/types/subtool';
import {
  CONVERSION_MATRIX,
  FROM_FORMAT_OPTIONS,
  TO_FORMAT_OPTIONS,
  EXTENSION_TO_ENDPOINT
} from '@app/constants/convertConstants';

/**
 * Generate sub-tools for the Convert tool based on the conversion matrix.
 * Creates one sub-tool for each valid FROM → TO conversion combination.
 *
 * @param t Translation function
 * @param parentTool The parent Convert tool entry
 * @param endpointAvailability Optional map of endpoint name -> enabled status
 * @returns Array of sub-tool entries
 */
export function generateConvertSubTools(
  t: TFunction,
  parentTool: ToolRegistryEntry,
  endpointAvailability?: Record<string, boolean>,
  endpointAvailabilityLoading?: boolean
): SubToolEntry[] {
  const subTools: SubToolEntry[] = [];

  // Iterate through all source formats in the conversion matrix
  for (const [fromExt, toExtensions] of Object.entries(CONVERSION_MATRIX)) {
    // Skip special cases that are too generic for sub-tools
    if (fromExt === 'any' || fromExt === 'image') {
      continue;
    }

    // Get the label for the source format
    const fromLabel = getFormatLabel(fromExt);
    if (!fromLabel) continue;

    // Create a sub-tool for each target format
    for (const toExt of toExtensions) {
      const toLabel = getFormatLabel(toExt);
      if (!toLabel) continue;

      // Check if endpoint is available (if availability map provided)
      let available = true;
      if (endpointAvailability) {
        const endpointName = getConversionEndpointName(fromExt, toExt);
        if (endpointName) {
          const status = endpointAvailability[endpointName];
          // While loading, stay optimistic; once loaded, mark unavailable when false
          available = endpointAvailabilityLoading ? true : status !== false;
        }
      }

      // Generate unique ID for this conversion
      const subToolId = `convert:${fromExt}-to-${toExt}`;

      // Create sub-tool entry
      subTools.push({
        id: subToolId,
        parentId: 'convert',
        name: t('convert.subtoolName', {
          defaultValue: 'Convert from {{from}} to {{to}}',
          from: fromLabel,
          to: toLabel
        }),
        description: t('convert.subtoolDescription', {
          defaultValue: 'Convert {{from}} files to {{to}} format',
          from: fromLabel,
          to: toLabel
        }),
        searchTerms: generateSearchTerms(t, fromExt, toExt, fromLabel, toLabel),
        navigationParams: { from: fromExt, to: toExt },
        icon: parentTool.icon,
        available,
      });
    }
  }

  return subTools;
}

/**
 * Get the display label for a file format extension.
 * Looks up in FROM_FORMAT_OPTIONS and TO_FORMAT_OPTIONS.
 *
 * @param extension File extension (e.g., 'pdf', 'png', 'docx')
 * @returns Display label (e.g., 'PDF', 'PNG', 'DOCX') or null if not found
 */
function getFormatLabel(extension: string): string | null {
  // Check FROM options first
  const fromOption = FROM_FORMAT_OPTIONS.find(opt => opt.value === extension);
  if (fromOption) return fromOption.label;

  // Check TO options
  const toOption = TO_FORMAT_OPTIONS.find(opt => opt.value === extension);
  if (toOption) return toOption.label;

  // Fallback: capitalize extension
  return extension ? extension.toUpperCase() : null;
}

/**
 * Generate search terms for a conversion sub-tool.
 * Includes: extensions, labels, and synonyms from translations.
 *
 * @param t Translation function
 * @param fromExt Source extension
 * @param toExt Target extension
 * @param fromLabel Source label
 * @param toLabel Target label
 * @returns Array of search terms (lowercased)
 */
function generateSearchTerms(
  t: TFunction,
  fromExt: string,
  toExt: string,
  fromLabel: string,
  toLabel: string
): string[] {
  const terms = new Set<string>();

  // Add extensions (lowercased)
  terms.add(fromExt.toLowerCase());
  terms.add(toExt.toLowerCase());

  // Add labels (lowercased)
  terms.add(fromLabel.toLowerCase());
  terms.add(toLabel.toLowerCase());

  // Add synonyms from translations
  const fromSynonyms = getFormatSynonyms(t, fromExt);
  const toSynonyms = getFormatSynonyms(t, toExt);

  fromSynonyms.forEach(syn => terms.add(syn));
  toSynonyms.forEach(syn => terms.add(syn));

  // Add common variations
  if (fromExt === 'jpeg') terms.add('jpg');
  if (fromExt === 'jpg') terms.add('jpeg');
  if (toExt === 'jpeg') terms.add('jpg');
  if (toExt === 'jpg') terms.add('jpeg');

  return Array.from(terms);
}

/**
 * Get format synonyms from translation files.
 * Looks up key like "convert.formats.png.synonyms" in translations.
 *
 * @param t Translation function
 * @param extension File extension
 * @returns Array of synonyms (lowercased)
 */
function getFormatSynonyms(t: TFunction, extension: string): string[] {
  const key = `convert.formats.${extension}.synonyms`;
  const synonymsString = t(key, { defaultValue: '' });

  if (!synonymsString || synonymsString === key) {
    return [];
  }

  return synonymsString
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
}

/**
 * Get the endpoint name for a specific conversion.
 * @param fromExt Source format extension
 * @param toExt Target format extension
 * @returns Endpoint name or null if not found
 */
export function getConversionEndpointName(fromExt: string, toExt: string): string | null {
  const endpointMap = EXTENSION_TO_ENDPOINT[fromExt];
  return endpointMap ? (endpointMap[toExt] || null) : null;
}

/**
 * Get all unique endpoint names used by conversion sub-tools.
 * Used to batch-fetch endpoint availability.
 * @returns Array of unique endpoint names
 */
export function getAllConversionEndpointNames(): string[] {
  const endpointNames = new Set<string>();

  for (const [fromExt, toExtensions] of Object.entries(CONVERSION_MATRIX)) {
    // Skip special cases
    if (fromExt === 'any' || fromExt === 'image') {
      continue;
    }

    for (const toExt of toExtensions) {
      const endpointName = getConversionEndpointName(fromExt, toExt);
      if (endpointName) {
        endpointNames.add(endpointName);
      }
    }
  }

  return Array.from(endpointNames);
}

/**
 * Check if a tool supports sub-tools.
 * Currently only Convert tool is supported, but designed for extensibility.
 *
 * @param toolId The tool identifier
 * @returns True if tool supports sub-tools
 */
export function toolSupportsSubTools(toolId: ToolId): boolean {
  return toolId === 'convert';
  // Future: Add more tools here (e.g., 'split', 'merge')
}

/**
 * Generate sub-tools for a specific parent tool.
 * Routes to the appropriate generator based on tool type.
 *
 * @param toolId Parent tool identifier
 * @param tool Parent tool entry
 * @param t Translation function
 * @param endpointAvailability Optional map of endpoint name -> enabled status
 * @returns Array of sub-tool entries
 */
export function generateSubToolsForTool(
  toolId: ToolId,
  tool: ToolRegistryEntry,
  t: TFunction,
  endpointAvailability?: Record<string, boolean>,
  endpointAvailabilityLoading?: boolean
): SubToolEntry[] {
  switch (toolId) {
    case 'convert':
      return generateConvertSubTools(t, tool, endpointAvailability, endpointAvailabilityLoading);
    // Future: Add more generators here
    // case 'split':
    //   return generateSplitSubTools(t, tool, endpointAvailability);
    // case 'merge':
    //   return generateMergeSubTools(t, tool, endpointAvailability);
    default:
      return [];
  }
}
