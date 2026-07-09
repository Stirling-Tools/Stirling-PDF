package stirling.software.SPDF.model.api.security;

/**
 * Metadata for a single signing certificate discovered on a hardware source (Windows certificate
 * store or a PKCS#11 token). Returned to the desktop frontend so the user can pick which
 * certificate to sign with. Never carries private key material - signing always happens on the
 * token / OS.
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
