import { httpJson } from "@portal/api/http";

/** GET /api/v1/assistant/suggestions */
export async function fetchAssistantSuggestions(): Promise<readonly string[]> {
  return httpJson<readonly string[]>("/api/v1/assistant/suggestions");
}

/** POST /api/v1/assistant/messages */
export async function getAssistantReply(input: string): Promise<string> {
  const res = await httpJson<{ reply: string }>("/api/v1/assistant/messages", {
    method: "POST",
    body: { input },
  });
  return res.reply;
}
