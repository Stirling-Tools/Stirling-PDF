import type { FileId } from "@editor/types/file";

/**
 * Wire shape of `/api/v1/security/accessibility-report`, mirroring the backend's
 * AccessibilityReport. Optional fields are ones an older backend omits.
 */
export interface AccessibilityIssue {
  clause: string;
  testNumber: string;
  message: string;
  technicalMessage?: string | null;
  severity: string;
  specification?: string | null;
  location?: string | null;
  occurrences: number;
  autoFixable: boolean;
  errorMessage?: string | null;
  tags?: string[];
  object?: string | null;
  test?: string | null;
  references?: string[];
  pages?: number[];
  /** False when `pages` lists only some of the pages the issue occurs on. */
  pagesComplete?: boolean;
}

export interface AccessibilityFigure {
  key: string;
  page: number;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  existingAlt?: string | null;
}

export interface AccessibilitySummary {
  pages: number;
  hasTitle: boolean;
  displaysDocTitle: boolean;
  hasLanguage: boolean;
  allFontsEmbedded: boolean;
  unembeddedFonts: number;
  figures: number;
  encrypted: boolean;
}

export interface AccessibilityChecks {
  total: number;
  failed: number;
  passed: number;
  rulesInProfile: number;
  rulesFailed: number;
}

export interface AccessibilityReport {
  profile: string;
  tagged: boolean;
  declaresConformance: boolean;
  passesAutomatedChecks: boolean;
  /** Set when the validator could not run; the rest of the report then describes that failure. */
  validationError?: string | null;
  issues: AccessibilityIssue[];
  humanChecks: string[];
  automaticallyFixable: number;
  needsInput: number;
  figuresNeedingDescription: AccessibilityFigure[];
  summary: AccessibilitySummary;
  checks?: AccessibilityChecks;
}

/** One file's outcome: a report, or the error that stopped it. */
export interface AccessibilityReportEntry {
  fileId: FileId;
  fileName: string;
  report: AccessibilityReport | null;
  error: string | null;
}
