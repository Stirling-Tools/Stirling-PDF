package stirling.software.SPDF.model.api.security;

/**
 * Request body for enumerating the certificates on a PKCS#11 token. The PIN is required to log into
 * the token; it is used only for the duration of the call and never stored.
 */
public record Pkcs11CertificatesRequest(String libraryPath, Integer slot, String pin) {}
