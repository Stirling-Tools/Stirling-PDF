import apiClient from "@app/services/apiClient";
import { uploadableFile } from "@app/utils/uploadableFile";
import type {
  BackendPipelineStep,
  PolicyRunView,
} from "@app/services/policyPipeline";
import type { ServerAutomationSession } from "@app/services/serverAutomationSession";
import { requireAutomationSession } from "@app/services/serverAutomationSession";
import { dispatchPaygLimitReached } from "@app/services/usageLimitBridge";

/** Uploads a complete pipeline; its connected server executes and meters every step. */
export async function submitServerPipeline(
  session: ServerAutomationSession,
  name: string,
  steps: BackendPipelineStep[],
  files: File[],
  assets: { key: string; file: Blob }[] = [],
): Promise<string> {
  const form = new FormData();
  form.append(
    "json",
    new Blob(
      [
        JSON.stringify({
          name,
          steps,
          outputs: [{ type: "inline", options: {} }],
        }),
      ],
      { type: "application/json" },
    ),
  );
  files.forEach((file) => form.append("fileInput", uploadableFile(file)));
  assets.forEach((asset, i) => {
    form.append(`assets[${i}].key`, asset.key);
    form.append(`assets[${i}].file`, asset.file);
  });
  const response = await apiClient.post<{ jobId: string }>(
    `${session.baseUrl}/api/v1/policies/run`,
    form,
    { automationSession: session.key },
  );
  return response.data.jobId;
}

/** Polls a server run without a processing timeout. Disconnecting stops local delivery. */
export async function waitForServerPipeline(
  session: ServerAutomationSession,
  runId: string,
  onProgress?: (run: PolicyRunView) => void,
): Promise<PolicyRunView> {
  for (;;) {
    const { data: run } = await apiClient.get<PolicyRunView>(
      `${session.baseUrl}/api/v1/policies/run/${encodeURIComponent(runId)}`,
      { automationSession: session.key },
    );
    onProgress?.(run);
    if (run.status === "COMPLETED") return run;
    if (["FAILED", "CANCELLED", "WAITING_FOR_INPUT"].includes(run.status)) {
      if (
        run.errorCode === "PAYG_LIMIT_REACHED" ||
        run.errorCode === "FEATURE_DEGRADED"
      ) {
        dispatchPaygLimitReached(run.errorSubscribed ?? null);
      }
      throw new Error(run.error ?? `Pipeline ${run.status.toLowerCase()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await requireAutomationSession(session.key);
  }
}

/** Downloads from the execution server even when the bundled backend supports file downloads. */
export async function downloadServerPipelineOutput(
  session: ServerAutomationSession,
  output: { fileId: string; fileName: string },
): Promise<File> {
  const { data } = await apiClient.get<Blob>(
    `${session.baseUrl}/api/v1/general/files/${encodeURIComponent(output.fileId)}`,
    { responseType: "blob", automationSession: session.key },
  );
  return new File([data], output.fileName, {
    type: data.type || "application/pdf",
  });
}
