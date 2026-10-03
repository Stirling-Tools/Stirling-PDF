import type { SavedSignatureType, SignatureScope } from "@app/types/signature";

export type CreateTab = "draw" | "type" | "upload" | "phone";

export type SaveScope = Exclude<SignatureScope, "localStorage">;

export interface TypedSignatureSource {
  signerName: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
}

export interface CreatedSignature {
  source: CreateTab;
  type: SavedSignatureType;
  dataUrl: string;
  text?: TypedSignatureSource;
  initials?: TypedSignatureSource & { dataUrl: string };
}

export interface SaveChoice {
  label: string;
  scope: SaveScope;
  makeDefault: boolean;
}

export interface SignaturePanelHandle {
  getResult: () => Promise<CreatedSignature | null>;
}

export interface TypePanelHandle extends SignaturePanelHandle {
  setName: (name: string) => void;
}

export interface UploadPanelHandle extends SignaturePanelHandle {
  loadSource: (dataUrl: string, fileName: string) => void;
}
