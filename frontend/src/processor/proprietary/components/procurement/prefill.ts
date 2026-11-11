import { createContext, useContext } from "react";

/**
 * Starting values for the procurement forms' required fields. Nothing in the product provides one;
 * a guided demo does, so it can run end to end without typing every field in front of an audience.
 * Each form still lets the values be edited.
 */
export interface ProcurementPrefill {
  seats?: number;
  contactName?: string;
  businessName?: string;
  contactEmail?: string;
  addressLine1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
}

export const ProcurementPrefillContext =
  createContext<ProcurementPrefill | null>(null);

export function useProcurementPrefill(): ProcurementPrefill | null {
  return useContext(ProcurementPrefillContext);
}
