/** The `system.datasource` block, previously the Database row's whole draft. */
export interface DatasourceSettingsData {
  enableCustomDatabase?: boolean;
  customDatabaseUrl?: string;
  username?: string;
  password?: string;
  type?: string;
  hostName?: string;
  port?: number;
  name?: string;
}

/**
 * Placeholder values for the custom-database form when `system.datasource` is
 * missing. `type` pre-fills the picker; it does not say what is running.
 */
export const DEFAULT_DATASOURCE: DatasourceSettingsData = {
  enableCustomDatabase: false,
  customDatabaseUrl: "",
  username: "",
  password: "",
  type: "postgresql",
  hostName: "localhost",
  port: 5432,
  name: "postgres",
};

/**
 * Is the server on its embedded H2, the only database it can back up? Custom
 * database off settles it: `type` above is a form default, not what is running.
 */
export function isEmbeddedH2Database(
  datasource: DatasourceSettingsData | undefined,
): boolean {
  if (datasource?.enableCustomDatabase !== true) return true;
  return (datasource.type || "").toLowerCase() === "h2";
}

export interface AdvancedSettingsData {
  enableAlphaFunctionality?: boolean;
  maxDPI?: number;
  enableUrlToPDF?: boolean;
  tessdataDir?: string;
  disableSanitize?: boolean;
  tempFileManagement?: {
    baseTmpDir?: string;
    libreofficeDir?: string;
    systemTempDir?: string;
    prefix?: string;
    maxAgeHours?: number;
    cleanupIntervalMinutes?: number;
    startupCleanup?: boolean;
    cleanupSystemTemp?: boolean;
  };
  processExecutor?: {
    sessionLimit?: {
      libreOfficeSessionLimit?: number;
      pdfToHtmlSessionLimit?: number;
      qpdfSessionLimit?: number;
      tesseractSessionLimit?: number;
      pythonOpenCvSessionLimit?: number;
      weasyPrintSessionLimit?: number;
      installAppSessionLimit?: number;
      calibreSessionLimit?: number;
      ghostscriptSessionLimit?: number;
      ocrMyPdfSessionLimit?: number;
    };
    timeoutMinutes?: {
      libreOfficetimeoutMinutes?: number;
      pdfToHtmltimeoutMinutes?: number;
      pythonOpenCvtimeoutMinutes?: number;
      weasyPrinttimeoutMinutes?: number;
      installApptimeoutMinutes?: number;
      calibretimeoutMinutes?: number;
      tesseractTimeoutMinutes?: number;
      qpdfTimeoutMinutes?: number;
      ghostscriptTimeoutMinutes?: number;
      ocrMyPdfTimeoutMinutes?: number;
    };
  };
  /** Read from the same `system` response as everything above it. */
  datasource?: DatasourceSettingsData;
}
