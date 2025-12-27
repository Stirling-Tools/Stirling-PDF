import { PdfJsonDocument, PdfJsonFont } from './pdfTextEditorTypes';

export type FontStatus = 'perfect' | 'embedded-subset' | 'system-fallback' | 'missing' | 'unknown';

export interface FontAnalysis {
  fontId: string;
  baseName: string;
  status: FontStatus;
  embedded: boolean;
  isSubset: boolean;
  isStandard14: boolean;
  hasWebFormat: boolean;
  webFormat?: string;
  subtype?: string;
  encoding?: string;
  warnings: string[];
  suggestions: string[];
}

export interface DocumentFontAnalysis {
  fonts: FontAnalysis[];
  canReproducePerfectly: boolean;
  hasWarnings: boolean;
  summary: {
    perfect: number;
    embeddedSubset: number;
    systemFallback: number;
    missing: number;
    unknown: number;
  };
}

/**
 * Determines if a font name indicates it's a subset font.
 * Subset fonts typically have a 6-character prefix like "ABCDEE+"
 */
const isSubsetFont = (baseName: string | null | undefined): boolean => {
  if (!baseName) return false;
  // Check for common subset patterns: ABCDEF+FontName
  return /^[A-Z]{6}\+/.test(baseName);
};

/**
 * Checks if a font is one of the standard 14 PDF fonts that are guaranteed
 * to be available on all PDF readers
 */
const isStandard14Font = (font: PdfJsonFont): boolean => {
  if (font.standard14Name) return true;

  const baseName = (font.baseName || '').toLowerCase().replace(/[-_\s]/g, '');

  const standard14Patterns = [
    'timesroman', 'timesbold', 'timesitalic', 'timesbolditalic',
    'helvetica', 'helveticabold', 'helveticaoblique', 'helveticaboldoblique',
    'courier', 'courierbold', 'courieroblique', 'courierboldoblique',
    'symbol', 'zapfdingbats'
  ];

  // Check exact matches or if the base name contains the pattern
  return standard14Patterns.some(pattern => {
    // Exact match
    if (baseName === pattern) return true;
    // Contains pattern (e.g., "ABCDEF+Helvetica" matches "helvetica")
    if (baseName.includes(pattern)) return true;
    return false;
  });
};

/**
 * Checks if a font has a fallback available on the backend.
 * These fonts are embedded in the Stirling PDF backend and can be used
 * for PDF export even if not in the original PDF.
 *
 * Based on PdfJsonFallbackFontService.java
 */
const hasBackendFallbackFont = (font: PdfJsonFont): boolean => {
  const baseName = (font.baseName || '').toLowerCase().replace(/[-_\s]/g, '');

  // Backend has these font families available (from PdfJsonFallbackFontService)
  const backendFonts = [
    // Liberation fonts (metric-compatible with MS core fonts)
    'arial', 'helvetica', 'arimo',
    'times', 'timesnewroman', 'tinos',
    'courier', 'couriernew', 'cousine',
    'liberation', 'liberationsans', 'liberationserif', 'liberationmono',
    // DejaVu fonts
    'dejavu', 'dejavusans', 'dejavuserif', 'dejavumono', 'dejavusansmono',
    // Noto fonts
    'noto', 'notosans'
  ];

  return backendFonts.some(pattern => {
    if (baseName === pattern) return true;
    if (baseName.includes(pattern)) return true;
    return false;
  });
};

/**
 * Extracts the base font name from a subset font name
 * e.g., "ABCDEF+Arial" -> "Arial"
 */
const extractBaseFontName = (baseName: string | null | undefined): string | null => {
  if (!baseName) return null;
  const match = baseName.match(/^[A-Z]{6}\+(.+)$/);
  return match ? match[1] : baseName;
};

/**
 * Analyzes a single font to determine if it can be reproduced perfectly
 * Takes allFonts to check if full versions of subset fonts are available
 */
export const analyzeFontReproduction = (font: PdfJsonFont, allFonts?: PdfJsonFont[]): FontAnalysis => {
  const fontId = font.id || font.uid || 'unknown';
  const baseName = font.baseName || 'Unknown Font';
  const isSubset = isSubsetFont(font.baseName);
  const isStandard14 = isStandard14Font(font);
  const hasBackendFallback = hasBackendFallbackFont(font);
  const embedded = font.embedded ?? false;

  // Check available web formats (ordered by preference)
  const webFormats = [
    { key: 'webProgram', format: font.webProgramFormat },
    { key: 'pdfProgram', format: font.pdfProgramFormat },
    { key: 'program', format: font.programFormat },
  ];

  const availableWebFormat = webFormats.find(f => f.format);
  const hasWebFormat = !!availableWebFormat;
  const webFormat = availableWebFormat?.format || undefined;

  const warnings: string[] = [];
  const suggestions: string[] = [];
  let status: FontStatus = 'unknown';

  // Check if we have the full font when this is a subset
  let hasFullFontVersion = false;
  if (isSubset && allFonts) {
    const baseFont = extractBaseFontName(font.baseName);
    if (baseFont) {
      // Look for a non-subset version of this font with a web format
      hasFullFontVersion = allFonts.some(f => {
        const otherBaseName = extractBaseFontName(f.baseName);
        const isNotSubset = !isSubsetFont(f.baseName);
        const hasFormat = !!(f.webProgramFormat || f.pdfProgramFormat || f.programFormat);
        const sameBase = otherBaseName?.toLowerCase() === baseFont.toLowerCase();
        return sameBase && isNotSubset && hasFormat && (f.embedded ?? false);
      });
    }
  }

  // Analyze font status - focusing on PDF export quality
  if (isStandard14) {
    // Standard 14 fonts are always available in PDF readers - perfect for export!
    status = 'perfect';
    suggestions.push('Standard PDF font (Times, Helvetica, or Courier). Always available in PDF readers.');
    suggestions.push('Exported PDFs will render consistently across all PDF readers.');
  } else if (embedded && !isSubset) {
    // Perfect: Fully embedded with complete character set
    status = 'perfect';
    suggestions.push('Font is fully embedded. Exported PDFs will reproduce text perfectly, even with edits.');
  } else if (embedded && isSubset && (hasFullFontVersion || hasBackendFallback)) {
    // Subset but we have the full font or backend fallback - perfect!
    status = 'perfect';
    if (hasFullFontVersion) {
      suggestions.push('Full font version is also available in the document. Exported PDFs can reproduce all characters.');
    } else if (hasBackendFallback) {
      suggestions.push('Backend has the full font available. Exported PDFs can reproduce all characters, including new text.');
    }
  } else if (embedded && isSubset) {
    // Good, but subset: May have missing characters if user adds new text
    status = 'embedded-subset';
    warnings.push('This is a subset font - only specific characters are embedded in the PDF.');
    warnings.push('Exported PDFs may have missing characters if you add new text with this font.');
    suggestions.push('Existing text will export correctly. New characters may render as boxes (☐) or fallback glyphs.');
  } else if (!embedded && hasBackendFallback) {
    // Not embedded, but backend has it - perfect for export!
    status = 'perfect';
    suggestions.push('Backend has this font available. Exported PDFs will use the backend fallback font.');
    suggestions.push('Text will export correctly with consistent appearance.');
  } else if (!embedded) {
    // Not embedded - must rely on system fonts (risky for export)
    status = 'missing';
    warnings.push('Font is not embedded in the PDF.');
    warnings.push('Exported PDFs will substitute with a fallback font, which may look very different.');
    suggestions.push('Consider re-embedding fonts or accepting that the exported PDF will use fallback fonts.');
  } else if (embedded && !hasWebFormat) {
    // Embedded but no web format available (still okay for export)
    status = 'perfect';
    suggestions.push('Font is embedded in the PDF. Exported PDFs will reproduce correctly.');
    suggestions.push('Web preview may use a fallback font, but the final PDF export will be accurate.');
  }

  // Additional warnings based on font properties
  if (font.subtype === 'Type0' && font.cidSystemInfo) {
    const registry = font.cidSystemInfo.registry || '';
    const ordering = font.cidSystemInfo.ordering || '';
    if (registry.includes('Adobe') && (ordering.includes('Identity') || ordering.includes('UCS'))) {
      // CID fonts with Identity encoding are common for Asian languages
      if (!embedded || !hasWebFormat) {
        warnings.push('This CID font may contain Asian or Unicode characters.');
      }
    }
  }

  if (font.encoding && !font.encoding.includes('WinAnsiEncoding') && !font.encoding.includes('MacRomanEncoding')) {
    // Custom encodings may cause issues
    if (font.encoding !== 'Identity-H' && font.encoding !== 'Identity-V') {
      warnings.push(`Custom encoding detected: ${font.encoding}`);
    }
  }

  return {
    fontId,
    baseName,
    status,
    embedded,
    isSubset,
    isStandard14,
    hasWebFormat,
    webFormat,
    subtype: font.subtype || undefined,
    encoding: font.encoding || undefined,
    warnings,
    suggestions,
  };
};

/**
 * Gets fonts used on a specific page
 */
export const getFontsForPage = (
  document: PdfJsonDocument | null,
  pageIndex: number
): PdfJsonFont[] => {
  if (!document?.fonts || !document?.pages || pageIndex < 0 || pageIndex >= document.pages.length) {
    return [];
  }

  const page = document.pages[pageIndex];
  if (!page?.textElements) {
    return [];
  }

  // Get unique font IDs used on this page
  const fontIdsOnPage = new Set<string>();
  page.textElements.forEach(element => {
    if (element?.fontId) {
      fontIdsOnPage.add(element.fontId);
    }
  });

  // Filter fonts to only those used on this page
  const allFonts = document.fonts.filter((font): font is PdfJsonFont => font !== null && font !== undefined);

  const fontsOnPage = allFonts.filter(font => {
    // Match by ID
    if (font.id && fontIdsOnPage.has(font.id)) {
      return true;
    }
    // Match by UID
    if (font.uid && fontIdsOnPage.has(font.uid)) {
      return true;
    }
    // Match by page-specific ID (pageNumber:id format)
    if (font.pageNumber === pageIndex + 1 && font.id) {
      const pageSpecificId = `${font.pageNumber}:${font.id}`;
      if (fontIdsOnPage.has(pageSpecificId) || fontIdsOnPage.has(font.id)) {
        return true;
      }
    }
    return false;
  });

  // Deduplicate by base font name to avoid showing the same font multiple times
  const uniqueFonts = new Map<string, PdfJsonFont>();
  fontsOnPage.forEach(font => {
    const baseName = extractBaseFontName(font.baseName) || font.baseName || font.id || 'unknown';
    const key = baseName.toLowerCase();

    // Keep the first occurrence, or prefer non-subset over subset
    const existing = uniqueFonts.get(key);
    if (!existing) {
      uniqueFonts.set(key, font);
    } else {
      // Prefer non-subset fonts over subset fonts
      const existingIsSubset = isSubsetFont(existing.baseName);
      const currentIsSubset = isSubsetFont(font.baseName);
      if (existingIsSubset && !currentIsSubset) {
        uniqueFonts.set(key, font);
      }
    }
  });

  return Array.from(uniqueFonts.values());
};

/**
 * Analyzes all fonts in a PDF document (or just fonts for a specific page)
 */
export const analyzeDocumentFonts = (
  document: PdfJsonDocument | null,
  pageIndex?: number
): DocumentFontAnalysis => {
  if (!document?.fonts || document.fonts.length === 0) {
    return {
      fonts: [],
      canReproducePerfectly: true,
      hasWarnings: false,
      summary: {
        perfect: 0,
        embeddedSubset: 0,
        systemFallback: 0,
        missing: 0,
        unknown: 0,
      },
    };
  }

  const allFonts = document.fonts.filter((font): font is PdfJsonFont => font !== null && font !== undefined);

  // Filter to page-specific fonts if pageIndex is provided
  const fontsToAnalyze = pageIndex !== undefined
    ? getFontsForPage(document, pageIndex)
    : allFonts;

  if (fontsToAnalyze.length === 0) {
    return {
      fonts: [],
      canReproducePerfectly: true,
      hasWarnings: false,
      summary: {
        perfect: 0,
        embeddedSubset: 0,
        systemFallback: 0,
        missing: 0,
        unknown: 0,
      },
    };
  }

  const fontAnalyses = fontsToAnalyze.map(font => analyzeFontReproduction(font, allFonts));

  // Calculate summary
  const summary = {
    perfect: fontAnalyses.filter(f => f.status === 'perfect').length,
    embeddedSubset: fontAnalyses.filter(f => f.status === 'embedded-subset').length,
    systemFallback: fontAnalyses.filter(f => f.status === 'system-fallback').length,
    missing: fontAnalyses.filter(f => f.status === 'missing').length,
    unknown: fontAnalyses.filter(f => f.status === 'unknown').length,
  };

  // Can reproduce perfectly ONLY if all fonts are truly perfect (not subsets)
  const canReproducePerfectly = fontAnalyses.every(f => f.status === 'perfect');

  // Has warnings if any font has issues (including subsets)
  const hasWarnings = fontAnalyses.some(
    f => f.warnings.length > 0 || f.status === 'missing' || f.status === 'system-fallback' || f.status === 'embedded-subset'
  );

  return {
    fonts: fontAnalyses,
    canReproducePerfectly,
    hasWarnings,
    summary,
  };
};

/**
 * Gets a human-readable description of the font status
 */
export const getFontStatusDescription = (status: FontStatus): string => {
  switch (status) {
    case 'perfect':
      return 'Fully embedded - perfect reproduction';
    case 'embedded-subset':
      return 'Embedded (subset) - existing text will render correctly';
    case 'system-fallback':
      return 'Using system font - appearance may differ';
    case 'missing':
      return 'Not embedded - will use fallback font';
    case 'unknown':
      return 'Unknown status';
  }
};

/**
 * Gets a color indicator for the font status
 */
export const getFontStatusColor = (status: FontStatus): string => {
  switch (status) {
    case 'perfect':
      return 'green';
    case 'embedded-subset':
      return 'blue';
    case 'system-fallback':
      return 'yellow';
    case 'missing':
      return 'red';
    case 'unknown':
      return 'gray';
  }
};

/**
 * Gets an icon indicator for the font status
 */
export const getFontStatusIcon = (status: FontStatus): string => {
  switch (status) {
    case 'perfect':
      return '✓';
    case 'embedded-subset':
      return '⚠';
    case 'system-fallback':
      return '⚠';
    case 'missing':
      return '✗';
    case 'unknown':
      return '?';
  }
};
