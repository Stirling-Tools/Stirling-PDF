import { httpJson } from "@portal/api/http";
import type { Endpoint, Vertical, VerticalKey } from "@shared/data/endpoints";

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

/** GET /v1/endpoints/flat — flat list across every vertical. */
export async function fetchAllEndpoints(): Promise<Endpoint[]> {
  return httpJson<Endpoint[]>("/v1/endpoints/flat");
}

/** GET /v1/endpoints?vertical=… */
export async function fetchEndpointsByVertical(
  key: VerticalKey,
): Promise<Endpoint[]> {
  return httpJson<Endpoint[]>(
    `/v1/endpoints?vertical=${encodeURIComponent(key)}`,
  );
}
