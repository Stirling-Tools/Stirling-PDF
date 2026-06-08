import { httpJson } from "@portal/api/http";

/** GET /v1/assistant/suggestions */
export async function fetchAssistantSuggestions(): Promise<readonly string[]> {
  return httpJson<readonly string[]>("/v1/assistant/suggestions");
}

/** POST /v1/assistant/messages */
export async function getAssistantReply(input: string): Promise<string> {
  const res = await httpJson<{ reply: string }>("/v1/assistant/messages", {
    method: "POST",
    body: { input },
  });
  return res.reply;
}
