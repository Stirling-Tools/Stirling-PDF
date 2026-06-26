import { apiClient } from "@portal/api/http";

/** GET /v1/assistant/suggestions */
export async function fetchAssistantSuggestions(): Promise<readonly string[]> {
  return apiClient.mock.json<readonly string[]>("/v1/assistant/suggestions");
}

/** POST /v1/assistant/messages */
export async function getAssistantReply(input: string): Promise<string> {
  const res = await apiClient.mock.json<{ reply: string }>(
    "/v1/assistant/messages",
    {
      method: "POST",
      body: { input },
    },
  );
  return res.reply;
}
