package stirling.software.SPDF.model.api.security;

/**
 * Metadata for one signing certificate: a hardware one (Windows store, macOS Keychain or a PKCS#11
 * token) the user can pick, or the server certificate shown for information. Never carries private
 * key material.
 */
public record HardwareCertificateInfo(
        String alias,
        String source,
        String subject,
        String issuer,
        String subjectCommonName,
        String issuerCommonName,
        String serialNumber,
        String keyAlgorithm,
        String notBefore,
        String notAfter,
        boolean expired,
        boolean notYetValid) {}
