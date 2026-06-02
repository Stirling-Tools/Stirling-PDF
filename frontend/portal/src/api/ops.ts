import { HttpError, httpJson } from "@portal/api/http";
import type { FeaturedOp, OpResultMap } from "@portal/mocks/ops";

export type { FeaturedOp, OpResultMap };

/** GET /v1/ops/featured */
export async function fetchFeaturedOps(): Promise<FeaturedOp[]> {
  return httpJson<FeaturedOp[]>("/v1/ops/featured");
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
    return await httpJson<{ result: OpResultMap; durationMs: number }>(
      `/v1/ops/${encodeURIComponent(opId)}/run`,
      {
        method: "POST",
        body: { sample },
      },
    );
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      throw new UnknownOpError(opId);
    }
    throw err;
  }
}
