/**
 * API client for the AI form fill engine (Python service on port 5001).
 * Uses the Vite proxy at /engine-api to avoid CORS issues.
 */
import axios from 'axios';
import type {
  DocumentExtractionRequest,
  DocumentExtractionResponse,
  FormAnalysisRequest,
  FormAnalysisResponse,
  FormFillBatchRequest,
  FormFillBatchResponse,
} from './types';

const aiEngineClient = axios.create({
  baseURL: '/engine-api',
  headers: { 'Content-Type': 'application/json' },
});

export async function extractFromDocuments(
  request: DocumentExtractionRequest
): Promise<DocumentExtractionResponse> {
  const response = await aiEngineClient.post<DocumentExtractionResponse>(
    '/api/v1/form/ai/extract',
    request
  );
  return response.data;
}

export async function analyseMultipleForms(
  request: FormAnalysisRequest
): Promise<FormAnalysisResponse> {
  const response = await aiEngineClient.post<FormAnalysisResponse>(
    '/api/v1/form/ai/analyse',
    request
  );
  return response.data;
}

export async function fillFormsBatch(
  request: FormFillBatchRequest
): Promise<FormFillBatchResponse> {
  const response = await aiEngineClient.post<FormFillBatchResponse>(
    '/api/v1/form/ai/fill-batch',
    request
  );
  return response.data;
}
