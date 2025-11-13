import apiClient from '@app/services/apiClient';

export interface ChatbotUsageSummary {
  allocatedTokens: number;
  consumedTokens: number;
  remainingTokens: number;
  usageRatio: number;
  nearingLimit: boolean;
  limitExceeded: boolean;
  lastIncrementTokens: number;
  window?: string;
}

export interface ChatbotSessionPayload {
  sessionId?: string;
  documentId: string;
  userId?: string;
  text: string;
  metadata?: Record<string, string>;
  ocrRequested: boolean;
  warningsAccepted: boolean;
}

export interface ChatbotSessionInfo {
  sessionId: string;
  documentId: string;
  alphaWarning: boolean;
  ocrRequested: boolean;
  maxCachedCharacters: number;
  createdAt: string;
  textCharacters: number;
  estimatedTokens: number;
  warnings?: string[];
  metadata?: Record<string, string>;
  usageSummary?: ChatbotUsageSummary;
}

export interface ChatbotQueryPayload {
  sessionId: string;
  prompt: string;
  allowEscalation: boolean;
}

export interface ChatbotMessageResponse {
  sessionId: string;
  modelUsed: string;
  confidence: number;
  answer: string;
  escalated: boolean;
  servedFromNanoOnly: boolean;
  cacheHit?: boolean;
  warnings?: string[];
  metadata?: Record<string, unknown>;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  usageSummary?: ChatbotUsageSummary;
}

export async function createChatbotSession(payload: ChatbotSessionPayload) {
  const { data } = await apiClient.post<ChatbotSessionInfo>('/api/v1/internal/chatbot/session', payload);
  return data;
}

export async function sendChatbotPrompt(payload: ChatbotQueryPayload) {
  const { data } = await apiClient.post<ChatbotMessageResponse>('/api/v1/internal/chatbot/query', payload);
  return data;
}
