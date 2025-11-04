import apiClient from '@app/services/apiClient';

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
  warnings?: string[];
  metadata?: Record<string, string>;
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
}

export async function createChatbotSession(payload: ChatbotSessionPayload) {
  const { data } = await apiClient.post<ChatbotSessionInfo>('/api/internal/chatbot/session', payload);
  return data;
}

export async function sendChatbotPrompt(payload: ChatbotQueryPayload) {
  const { data } = await apiClient.post<ChatbotMessageResponse>('/api/internal/chatbot/query', payload);
  return data;
}

