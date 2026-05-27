import { httpJson } from "@portal/api/http";
import type { Vertical } from "@shared/data/endpoints";

export type {
  Endpoint,
  EndpointSchema,
  EndpointTierGate,
  Vertical,
  VerticalKey,
} from "@shared/data/endpoints";

/** GET /v1/endpoints — verticals plus their endpoints. */
export async function fetchVerticals(): Promise<Vertical[]> {
  return httpJson<Vertical[]>("/v1/endpoints");
}
