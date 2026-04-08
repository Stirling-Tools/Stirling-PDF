/**
 * Types for the AI Form Fill tool.
 * Mirror the Python engine's form_fill contracts.
 */
import type { FormField } from '@app/tools/formFill/types';

export type { FormField };

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiFormFillRequest {
  userMessage: string;
  conversationHistory: ConversationMessage[];
  formFields: FormField[];
  knowledge: Record<string, string>;
  extractedDocumentText?: string;
  roleOverride?: string;
}

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

export interface RoleDetectionResult {
  detectedRoles: DetectedRole[];
  primaryRoleLabel: string | null;
  primaryConfidence: number;
  confidenceReasoning: string;
}

export interface FillResultResponse {
  outcome: 'fill_result';
  filledFields: FieldMapping[];
  cleanedLabels: CleanedLabel[];
  skippedFieldNames: string[];
  roleDetection: RoleDetectionResult | null;
  message: string;
}

export interface RoleConfirmationResponse {
  outcome: 'role_confirmation_needed';
  roleDetection: RoleDetectionResult;
  suggestedPrimary: string;
  question: string;
  provisionalFills: FieldMapping[];
  cleanedLabels: CleanedLabel[];
  skippedFieldNames: string[];
}

export interface KnowledgeUpdateResponse {
  outcome: 'knowledge_update';
  proposedEntries: KnowledgeEntry[];
  message: string;
}

export interface FormFillClarificationResponse {
  outcome: 'form_fill_clarification';
  question: string;
  reason: string;
}

export type AiFormFillResponse =
  | FillResultResponse
  | RoleConfirmationResponse
  | KnowledgeUpdateResponse
  | FormFillClarificationResponse;

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
  perFile: AnalysedFileResult[];
  crossFileRoles: CrossFileRole[];
  message: string;
}

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

export type AiFormFillPhase =
  | 'idle'
  | 'fetching_fields'
  | 'analysing'
  | 'analysis_review'
  | 'filling'
  | 'role_confirm'
  | 'results'
  | 'applying';
