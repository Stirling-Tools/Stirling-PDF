/**
 * Types for the AI Form Fill tool.
 * Mirror the Python engine's form_fill contracts.
 */
import type { FormField } from '@app/tools/formFill/types';

export type { FormField };

export interface FieldMapping {
  fieldName: string;
  knowledgeKey: string;
  value: string;
}

export interface CleanedLabel {
  fieldName: string;
  label: string;
}

export interface KnowledgeEntry {
  key: string;
  value: string;
  source: string;
}

export interface DetectedRole {
  roleLabel: string;
  fieldNames: string[];
  isPrimaryPerson: boolean;
}

export interface KnowledgeUpdateResponse {
  outcome: 'knowledge_update';
  proposedEntries: KnowledgeEntry[];
  message: string;
}

export interface DocumentText {
  fileName: string;
  text: string;
}

export interface DocumentExtractionRequest {
  documents: DocumentText[];
  existingProfileNames: string[];
}

export interface ProposedProfile {
  suggestedName: string;
  entries: KnowledgeEntry[];
  sourceDocuments: string[];
}

export interface MultiProfileExtractionResponse {
  outcome: 'multi_profile_extraction';
  proposedProfiles: ProposedProfile[];
  message: string;
}

export type DocumentExtractionResponse =
  | KnowledgeUpdateResponse
  | MultiProfileExtractionResponse;

// --- Form Analysis (multi-file) ---

export interface FileFieldSet {
  fileId: string;
  fileName: string;
  formFields: FormField[];
}

export interface FormAnalysisRequest {
  files: FileFieldSet[];
}

export interface AnalysedFileResult {
  fileId: string;
  fileName: string;
  detectedRoles: DetectedRole[];
  cleanedLabels: CleanedLabel[];
  skippedFieldNames: string[];
}

export interface CrossFileRole {
  roleLabel: string;
  fileIds: string[];
  fieldNamesByFile: Record<string, string[]>;
  isPrimaryPerson: boolean;
}

export interface FormAnalysisResponse {
  outcome: 'form_analysis';
  perFile: AnalysedFileResult[];
  crossFileRoles: CrossFileRole[];
  message: string;
}

export interface FormAnalysisAmbiguousResponse {
  outcome: 'form_analysis_ambiguous';
  reason: string;
  suggestion: string | null;
}

export type FormAnalysisWorkflowResponse =
  | FormAnalysisResponse
  | FormAnalysisAmbiguousResponse;

// --- Batch Fill ---

export interface FileFillRequest {
  fileId: string;
  formFields: FormField[];
  roleLabel: string;
}

export interface FormFillBatchRequest {
  files: FileFillRequest[];
  knowledge: Record<string, string>;
}

export interface FileFillResult {
  fileId: string;
  filledFields: FieldMapping[];
}

export interface FormFillBatchResponse {
  outcome: 'batch_fill_result';
  perFile: FileFillResult[];
  message: string;
}
