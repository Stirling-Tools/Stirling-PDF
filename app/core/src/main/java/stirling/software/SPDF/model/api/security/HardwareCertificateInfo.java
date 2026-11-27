package stirling.software.SPDF.model.api.security;

/**
 * Metadata for one signing certificate: a hardware one (Windows store, macOS Keychain or a PKCS#11
 * token) the user can pick, or the server certificate shown for information. Never carries private
 * key material. {@code onToken} is true for a key on a smart card or security key, false for one
 * stored on this device, and null where the source cannot tell: PKCS#11, whose drivers include
 * software tokens, and a Windows store key whose provider does not report where it is held. {@code
 * sha256} is the certificate's SHA-256 fingerprint in lowercase hex, which a sign request can pass
 * back as {@code expectedCertificateSha256}. {@code displaySubject} is the subject as a visible
 * signature's certificate details line writes it.
 */
public record HardwareCertificateInfo(
        String alias,
        String source,
        String subject,
        String displaySubject,
        String issuer,
        String subjectCommonName,
        String issuerCommonName,
        String serialNumber,
        String keyAlgorithm,
        String notBefore,
        String notAfter,
        boolean expired,
        boolean notYetValid,
        Boolean onToken,
        String sha256) {}
