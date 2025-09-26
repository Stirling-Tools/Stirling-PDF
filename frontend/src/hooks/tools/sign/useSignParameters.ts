import { useBaseParameters } from '../shared/useBaseParameters';

export interface SignaturePosition {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface SignParameters {
  signatureType: 'image' | 'text' | 'draw' | 'canvas';
  signatureData?: string; // Base64 encoded image or text content
  signaturePosition?: SignaturePosition;
  reason?: string;
  location?: string;
  signerName?: string;
  fontFamily?: string;
  fontSize?: number;
}

export const DEFAULT_PARAMETERS: SignParameters = {
  signatureType: 'canvas',
  reason: 'Document signing',
  location: 'Digital',
  signerName: '',
  fontFamily: 'Helvetica',
  fontSize: 16,
};

const validateSignParameters = (parameters: SignParameters): boolean => {
  // Basic validation
  if (!parameters.signatureType) return false;

  // If signature position is set, validate it
  if (parameters.signaturePosition) {
    const pos = parameters.signaturePosition;
    if (pos.x < 0 || pos.y < 0 || pos.width <= 0 || pos.height <= 0 || pos.page < 0) {
      return false;
    }
  }

  // For image and canvas signatures, require signature data
  if ((parameters.signatureType === 'image' || parameters.signatureType === 'canvas') && !parameters.signatureData) {
    return false;
  }
  // For text signatures, require signer name
  if (parameters.signatureType === 'text' && !parameters.signerName) {
    return false;
  }

  return true;
};

export const useSignParameters = () => {
  return useBaseParameters<SignParameters>({
    defaultParameters: DEFAULT_PARAMETERS,
    endpointName: 'add-signature',
    validateFn: validateSignParameters,
  });
};