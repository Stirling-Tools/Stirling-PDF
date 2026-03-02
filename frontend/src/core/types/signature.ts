export type SavedSignatureType = 'canvas' | 'image' | 'text';
export type SignatureScope = 'personal' | 'shared' | 'localStorage';

export type SavedSignaturePayload =
  | {
      type: 'canvas';
      dataUrl: string;
    }
  | {
      type: 'image';
      dataUrl: string;
    }
  | {
      type: 'text';
      dataUrl: string;
      signerName: string;
      fontFamily: string;
      fontSize: number;
      textColor: string;
    };

export type SavedSignature = SavedSignaturePayload & {
  id: string;
  label: string;
  scope: SignatureScope;
  createdAt: number;
  updatedAt: number;
};
