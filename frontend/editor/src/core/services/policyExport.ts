/**
 * Open-source stub for export-time policy enforcement. Policies are a proprietary
 * feature, so in the core build there's nothing to enforce — this returns the
 * files unchanged and nothing blocked. The proprietary build shadows this module
 * via the `@app/*` alias with the real implementation.
 */
export interface ExportEnforcementResult {
  files: File[];
  blocked: string[];
}

export async function enforceExportPolicies(
  files: File[],
  _fileIds?: (string | undefined)[],
  _trigger?: "export" | "print" | "convert" | "input",
): Promise<ExportEnforcementResult> {
  return { files, blocked: [] };
}
