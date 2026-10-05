import type {
  SavedSignature,
  SavedSignaturePayload,
  SavedSignatureType,
} from "@app/types/signature";
import type { CreatedSignature } from "@app/components/tools/sign/createSignature/types";

export const DRAFT_KEY = "draft";

export interface WalletEntry {
  key: string;
  label: string;
  dataUrl: string;
  type: SavedSignatureType;
  created?: CreatedSignature;
}

export function toWalletEntry(signature: SavedSignature): WalletEntry {
  return {
    key: signature.id,
    label: signature.label,
    dataUrl: signature.dataUrl,
    type: signature.type,
  };
}

export function createdToPayload(
  created: CreatedSignature,
): SavedSignaturePayload {
  if (created.type === "text" && created.text) {
    return { type: "text", dataUrl: created.dataUrl, ...created.text };
  }
  return {
    type: created.type === "canvas" ? "canvas" : "image",
    dataUrl: created.dataUrl,
  };
}

export function savedToPayload(
  signature: SavedSignature,
): SavedSignaturePayload {
  if (signature.type !== "text") {
    return { type: signature.type, dataUrl: signature.dataUrl };
  }
  const { signerName, fontFamily, fontSize, textColor } = signature;
  return {
    type: "text",
    dataUrl: signature.dataUrl,
    signerName,
    fontFamily,
    fontSize,
    textColor,
  };
}
