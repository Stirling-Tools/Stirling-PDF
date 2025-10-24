export interface SignatureValidationBackendResult {
  valid: boolean;
  chainValid: boolean;
  trustValid: boolean;
  chainValidationError?: string | null;
  certPathLength?: number | null;
  notExpired: boolean;
  revocationChecked?: boolean | null;
  revocationStatus?: string | null; // "not-checked" | "good" | "revoked" | "soft-fail" | "unknown"
  validationTimeSource?: string | null; // "current" | "signing-time" | "timestamp"
  signerName?: string | null;
  signatureDate?: string | null;
  reason?: string | null;
  location?: string | null;
  issuerDN?: string | null;
  subjectDN?: string | null;
  serialNumber?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  signatureAlgorithm?: string | null;
  keySize?: number | string | null;
  version?: string | number | null;
  keyUsages?: string[] | null;
  selfSigned?: boolean | null;
  errorMessage?: string | null;
}

export interface SignatureValidationSignature {
  id: string;
  valid: boolean;
  chainValid: boolean;
  trustValid: boolean;
  chainValidationError?: string | null;
  certPathLength?: number | null;
  notExpired: boolean;
  revocationChecked?: boolean | null;
  revocationStatus?: string | null; // "not-checked" | "good" | "revoked" | "soft-fail" | "unknown"
  validationTimeSource?: string | null; // "current" | "signing-time" | "timestamp"
  signerName: string;
  signatureDate: string;
  reason: string;
  location: string;
  issuerDN: string;
  subjectDN: string;
  serialNumber: string;
  validFrom: string;
  validUntil: string;
  signatureAlgorithm: string;
  keySize: number | null;
  version: string;
  keyUsages: string[];
  selfSigned: boolean;
  errorMessage: string | null;
}

export interface SignatureValidationFileResult {
  fileId: string;
  fileName: string;
  signatures: SignatureValidationSignature[];
  error?: string | null;
  fileSize?: number | null;
  lastModified?: number | null;
}

export interface SignatureValidationReportEntry extends SignatureValidationFileResult {
  thumbnailUrl?: string | null;
  fileSize?: number | null;
  lastModified?: number | null;
  createdAtLabel?: string | null;
  summaryGeneratedAt?: number | null;
  statusText?: string | null;
}

export interface SignatureValidationReportData {
  generatedAt: number;
  entries: SignatureValidationReportEntry[];
}
