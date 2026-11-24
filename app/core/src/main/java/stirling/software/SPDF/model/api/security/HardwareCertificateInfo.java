package stirling.software.SPDF.model.api.security;

/**
 * Metadata for one signing certificate: a hardware one (Windows store, macOS Keychain or a PKCS#11
 * token) the user can pick, or the server certificate shown for information. Never carries private
 * key material. {@code onToken} is true for a key on a smart card or security key, false for one
 * stored on this device, and null where the source cannot tell (the Windows store, and PKCS#11,
 * whose drivers include software tokens).
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
        boolean notYetValid,
        Boolean onToken) {}
