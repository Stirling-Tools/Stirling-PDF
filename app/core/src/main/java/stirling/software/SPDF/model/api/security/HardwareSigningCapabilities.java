package stirling.software.SPDF.model.api.security;

import java.util.List;

/**
 * Describes what hardware-backed signing the local backend can offer. Only meaningful on the
 * desktop bundle, where the backend runs as a local sidecar in the signed-in user's session and can
 * reach the Windows certificate store / a plugged-in USB PKCS#11 token.
 */
public record HardwareSigningCapabilities(
        boolean desktop,
        String osName,
        boolean windowsStoreSupported,
        boolean pkcs11Supported,
        List<Pkcs11LibraryInfo> detectedLibraries) {

    /** A PKCS#11 driver library detected on disk (or supplied via configuration). */
    public record Pkcs11LibraryInfo(String name, String path) {}
}
