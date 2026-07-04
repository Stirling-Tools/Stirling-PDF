import { http, HttpResponse, delay } from "msw";
import {
  ASSISTANT_SUGGESTIONS,
  routeAssistantReply,
} from "@portal/mocks/assistant";

interface AssistantMessageBody {
  input: string;
}

export const assistantHandlers = [
  http.get("/v1/assistant/suggestions", async () => {
    return HttpResponse.json(ASSISTANT_SUGGESTIONS);
  }),

  http.post("/v1/assistant/messages", async ({ request }) => {
    const body = (await request.json()) as AssistantMessageBody;
    await delay(600 + Math.random() * 300);
    return HttpResponse.json({ reply: routeAssistantReply(body.input) });
  }),
];
