import { httpJson } from "@portal/api/http";
import type { Vertical } from "@shared/data/endpoints";

export type {
  Endpoint,
  EndpointSchema,
  EndpointTierGate,
  Vertical,
  VerticalKey,
} from "@shared/data/endpoints";

/** GET /api/v1/endpoints — verticals plus their endpoints. */
export async function fetchVerticals(): Promise<Vertical[]> {
  return httpJson<Vertical[]>("/api/v1/endpoints");
}
