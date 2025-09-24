/**
 * Service for detecting signatures in PDF files using PDF.js
 * This provides a quick client-side check to determine if a PDF contains signatures
 * without needing to make API calls
 */

// PDF.js types (simplified)
declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

export interface SignatureDetectionResult {
  hasSignatures: boolean;
  signatureCount?: number;
  error?: string;
}

export interface FileSignatureStatus {
  file: File;
  result: SignatureDetectionResult;
}

/**
 * Detect signatures in a single PDF file using PDF.js
 */
const detectSignaturesInFile = async (file: File): Promise<SignatureDetectionResult> => {
  try {
    // Ensure PDF.js is available
    if (!window.pdfjsLib) {
      return {
        hasSignatures: false,
        error: 'PDF.js not available'
      };
    }

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Load the PDF document
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let totalSignatures = 0;
    
    // Check each page for signature annotations
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const annotations = await page.getAnnotations();
      
      // Count signature annotations (Type: /Sig)
      const signatureAnnotations = annotations.filter((annotation: any) => 
        annotation.subtype === 'Widget' && 
        annotation.fieldType === 'Sig'
      );
      
      totalSignatures += signatureAnnotations.length;
    }
    
    // Also check for document-level signatures in AcroForm
    const metadata = await pdf.getMetadata();
    if (metadata?.info?.Signature || metadata?.metadata?.has('dc:signature')) {
      totalSignatures = Math.max(totalSignatures, 1);
    }
    
    // Clean up PDF.js document
    pdf.destroy();
    
    return {
      hasSignatures: totalSignatures > 0,
      signatureCount: totalSignatures
    };
    
  } catch (error) {
    console.warn('PDF signature detection failed:', error);
    return {
      hasSignatures: false,
      signatureCount: 0,
      error: error instanceof Error ? error.message : 'Detection failed'
    };
  }
};

/**
 * Detect if PDF files contain signatures using PDF.js client-side processing
 */
export const detectSignaturesInFiles = async (files: File[]): Promise<FileSignatureStatus[]> => {
  const results: FileSignatureStatus[] = [];
  
  for (const file of files) {
    const result = await detectSignaturesInFile(file);
    results.push({ file, result });
  }
  
  return results;
};

/**
 * Hook for managing signature detection state
 */
export const useSignatureDetection = () => {
  const [detectionResults, setDetectionResults] = React.useState<FileSignatureStatus[]>([]);
  const [isDetecting, setIsDetecting] = React.useState(false);
  
  const detectSignatures = async (files: File[]) => {
    if (files.length === 0) {
      setDetectionResults([]);
      return;
    }
    
    setIsDetecting(true);
    try {
      const results = await detectSignaturesInFiles(files);
      setDetectionResults(results);
    } finally {
      setIsDetecting(false);
    }
  };
  
  const getFileSignatureStatus = (file: File): SignatureDetectionResult | null => {
    const result = detectionResults.find(r => r.file === file);
    return result ? result.result : null;
  };
  
  const hasAnySignatures = detectionResults.some(r => r.result.hasSignatures);
  const totalSignatures = detectionResults.reduce((sum, r) => sum + (r.result.signatureCount || 0), 0);
  
  return {
    detectionResults,
    isDetecting,
    detectSignatures,
    getFileSignatureStatus,
    hasAnySignatures,
    totalSignatures,
    reset: () => setDetectionResults([])
  };
};

// Import React for the hook
import React from 'react';