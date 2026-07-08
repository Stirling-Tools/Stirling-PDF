import { apiClient, HttpError } from "@portal/api/http";

export type OpResultMap = Record<string, unknown>;

export interface FeaturedOp {
  id: string;
  label: string;
  endpoint: string;
  accent: "blue" | "purple" | "green" | "amber" | "red";
  /** Shown in the picker — short single line. */
  blurb: string;
}

/** GET /v1/ops/featured */
export async function fetchFeaturedOps(): Promise<FeaturedOp[]> {
  return apiClient.local.json<FeaturedOp[]>("/v1/ops/featured");
}

export class UnknownOpError extends Error {
  constructor(public readonly opId: string) {
    super(`Unknown op: ${opId}`);
    this.name = "UnknownOpError";
  }
}

/** POST /v1/ops/{opId}/run */
export async function runSingleOp(
  opId: string,
  sample: string,
): Promise<{ result: OpResultMap; durationMs: number }> {
  try {
    return await apiClient.local.json<{
      result: OpResultMap;
      durationMs: number;
    }>(`/v1/ops/${encodeURIComponent(opId)}/run`, {
      method: "POST",
      body: { sample },
    });
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      throw new UnknownOpError(opId);
    }
    throw err;
  }
}
