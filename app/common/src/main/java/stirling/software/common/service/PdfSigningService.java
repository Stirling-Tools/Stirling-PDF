package stirling.software.common.service;

import java.security.KeyStore;

/**
 * Abstraction for PDF digital signature operations. Defined in common so that proprietary services
 * can use it without creating a circular dependency on core.
 */
public interface PdfSigningService {

    /**
     * Signs a PDF document using the provided KeyStore.
     *
     * @param pdfBytes raw PDF bytes to sign
     * @param keystore the KeyStore containing the signing key and certificate chain
     * @param password keystore password
     * @param showSignature whether to render a visible signature block
     * @param pageNumber 0-indexed page on which to render the visible signature (may be null)
     * @param name signer name embedded in the signature
     * @param location location string embedded in the signature
     * @param reason reason string embedded in the signature
     * @param showLogo whether to include the Stirling-PDF logo in the visible signature
     * @return signed PDF bytes
     * @throws Exception on any signing failure
     */
    byte[] signWithKeystore(
            byte[] pdfBytes,
            KeyStore keystore,
            char[] password,
            boolean showSignature,
            Integer pageNumber,
            String name,
            String location,
            String reason,
            boolean showLogo,
            Double signatureRectX,
            Double signatureRectY,
            Double signatureRectWidth,
            Double signatureRectHeight)
            throws Exception;
}
