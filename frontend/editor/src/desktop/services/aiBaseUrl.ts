import { operationRouter } from "@app/services/operationRouter";

/** AI streams and their outputs belong to the authenticated, connected server. */
export async function getAiBaseUrl(): Promise<string> {
  return operationRouter.getConnectedServerBaseUrl();
}
