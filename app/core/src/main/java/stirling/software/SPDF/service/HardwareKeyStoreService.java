package stirling.software.SPDF.service;

import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.Provider;
import java.security.Security;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import javax.security.auth.x500.X500Principal;

import org.bouncycastle.asn1.x500.RDN;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.asn1.x500.style.IETFUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.HardwareCertificateInfo;
import stirling.software.SPDF.model.api.security.HardwareSigningCapabilities;
import stirling.software.SPDF.model.api.security.HardwareSigningCapabilities.Pkcs11LibraryInfo;
import stirling.software.common.util.ExceptionUtils;

/**
 * Bridges PDF signing to hardware-held keys: the Windows certificate store (via the JDK SunMSCAPI
 * provider) and USB / smart-card PKCS#11 tokens (via SunPKCS11). The private key never leaves the
 * token - the JCA routes the actual signing operation onto the hardware.
 *
 * <p>These code paths are gated to the desktop bundle. On a hosted server the backend cannot reach
 * a remote user's USB token anyway, and loading an arbitrary PKCS#11 driver library is effectively
 * native code execution, so PKCS#11 libraries are additionally restricted to an allowlist of
 * detected / configured driver paths.
 */
@Service
@Slf4j
public class HardwareKeyStoreService {

    public static final String SOURCE_WINDOWS_STORE = "WINDOWS_STORE";
    public static final String SOURCE_PKCS11 = "PKCS11";

    private static final String WINDOWS_KEYSTORE_TYPE = "Windows-MY";
    private static final String MSCAPI_PROVIDER = "SunMSCAPI";
    private static final String PKCS11_BASE_PROVIDER = "SunPKCS11";

    /** Extra PKCS#11 driver libraries, absolute paths, comma/`File.pathSeparator` separated. */
    private static final String PKCS11_LIBRARIES_ENV = "STIRLING_PKCS11_LIBRARIES";

    /** Same as {@link #PKCS11_LIBRARIES_ENV} but as a JVM system property. */
    private static final String PKCS11_LIBRARIES_PROP = "stirling.pkcs11.libraries";

    private final String machineType;

    public HardwareKeyStoreService(
            @Autowired(required = false) @Qualifier("machineType") String machineType) {
        this.machineType = machineType;
    }

    // ---------------------------------------------------------------------
    // Gating
    // ---------------------------------------------------------------------

    /**
     * True when running as the desktop bundle (local sidecar in the user's session). The Tauri
     * bundle sets {@code STIRLING_PDF_TAURI_MODE=true} (with {@code BROWSER_OPEN=false}, so
     * machineType is {@code Server-jar} there); the bare-jar desktop launcher instead yields a
     * {@code Client-*} machineType. Accept either.
     */
    public boolean isDesktop() {
        if (Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"))) {
            return true;
        }
        return machineType != null && machineType.startsWith("Client-");
    }

    public boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    private boolean windowsStoreSupported() {
        return isWindows() && Security.getProvider(MSCAPI_PROVIDER) != null;
    }

    private boolean pkcs11Supported() {
        return Security.getProvider(PKCS11_BASE_PROVIDER) != null;
    }

    /** Reject anything that is not the desktop bundle reached over loopback. */
    public void assertLocalDesktop(HttpServletRequest request) {
        if (!isDesktop()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.hardwareSigningDesktopOnly",
                    "Hardware-backed signing is only available in the Stirling PDF desktop app");
        }
        if (request != null && !isLocalRequest(request.getRemoteAddr())) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.hardwareSigningLocalOnly",
                    "Hardware-backed signing can only be used from this device");
        }
    }

    /**
     * True when the request originates from this machine. Loopback (incl. IPv4-mapped IPv6 like
     * {@code ::ffff:127.0.0.1}) counts, as does any address bound to a local interface - so it
     * works whether the desktop app reaches the sidecar over {@code localhost} or a LAN IP, while
     * still rejecting other machines on the network.
     */
    static boolean isLocalRequest(String remoteAddr) {
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return false;
        }
        try {
            InetAddress addr = InetAddress.getByName(remoteAddr);
            if (addr.isLoopbackAddress() || addr.isAnyLocalAddress()) {
                return true;
            }
            return NetworkInterface.networkInterfaces()
                    .anyMatch(nif -> nif.inetAddresses().anyMatch(local -> local.equals(addr)));
        } catch (Exception e) {
            return false;
        }
    }

    // ---------------------------------------------------------------------
    // Capabilities
    // ---------------------------------------------------------------------

    public HardwareSigningCapabilities capabilities() {
        boolean desktop = isDesktop();
        if (!desktop) {
            return new HardwareSigningCapabilities(false, "", false, false, List.of());
        }
        return new HardwareSigningCapabilities(
                true,
                System.getProperty("os.name", ""),
                windowsStoreSupported(),
                pkcs11Supported(),
                detectPkcs11Libraries());
    }

    /**
     * Known driver install locations plus any paths configured via {@code
     * STIRLING_PKCS11_LIBRARIES}.
     */
    public List<Pkcs11LibraryInfo> detectPkcs11Libraries() {
        Map<String, List<String>> candidates = new LinkedHashMap<>();
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);

        if (os.contains("win")) {
            candidates.put(
                    "OpenSC",
                    List.of(
                            "C:\\Program Files\\OpenSC Project\\OpenSC\\pkcs11\\opensc-pkcs11.dll"));
            candidates.put(
                    "YubiKey (ykcs11)",
                    List.of("C:\\Program Files\\Yubico\\Yubico PIV Tool\\bin\\libykcs11.dll"));
            candidates.put("SafeNet eToken", List.of("C:\\Windows\\System32\\eTPKCS11.dll"));
            candidates.put(
                    "Thales/Gemalto IDPrime", List.of("C:\\Windows\\System32\\IDPrimePKCS11.dll"));
            candidates.put(
                    "SoftHSM2",
                    List.of(
                            "C:\\Program Files\\SoftHSM2\\lib\\softhsm2-x64.dll",
                            "C:\\SoftHSM2\\lib\\softhsm2-x64.dll"));
        } else if (os.contains("mac")) {
            candidates.put(
                    "OpenSC",
                    List.of(
                            "/Library/OpenSC/lib/opensc-pkcs11.so",
                            "/usr/local/lib/opensc-pkcs11.so"));
            candidates.put(
                    "YubiKey (ykcs11)",
                    List.of("/usr/local/lib/libykcs11.dylib", "/opt/homebrew/lib/libykcs11.dylib"));
            candidates.put(
                    "SoftHSM2",
                    List.of(
                            "/usr/local/lib/softhsm/libsofthsm2.so",
                            "/opt/homebrew/lib/softhsm/libsofthsm2.so"));
        } else {
            candidates.put(
                    "OpenSC",
                    List.of(
                            "/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so",
                            "/usr/lib/opensc-pkcs11.so",
                            "/usr/lib64/opensc-pkcs11.so"));
            candidates.put(
                    "YubiKey (ykcs11)",
                    List.of(
                            "/usr/lib/x86_64-linux-gnu/libykcs11.so",
                            "/usr/local/lib/libykcs11.so"));
            candidates.put(
                    "SoftHSM2",
                    List.of(
                            "/usr/lib/softhsm/libsofthsm2.so",
                            "/usr/lib64/softhsm/libsofthsm2.so",
                            "/usr/local/lib/softhsm/libsofthsm2.so"));
        }

        List<Pkcs11LibraryInfo> result = new ArrayList<>();
        candidates.forEach(
                (name, paths) ->
                        paths.stream()
                                .filter(p -> Files.exists(Path.of(p)))
                                .findFirst()
                                .ifPresent(p -> result.add(new Pkcs11LibraryInfo(name, p))));

        for (String configured : configuredLibraries()) {
            if (Files.exists(Path.of(configured))
                    && result.stream().noneMatch(l -> sameFile(l.path(), configured))) {
                result.add(new Pkcs11LibraryInfo(fileName(configured), configured));
            }
        }
        return result;
    }

    private static List<String> configuredLibraries() {
        String env = System.getenv(PKCS11_LIBRARIES_ENV);
        String prop = System.getProperty(PKCS11_LIBRARIES_PROP);
        StringBuilder combined = new StringBuilder();
        if (env != null && !env.isBlank()) {
            combined.append(env);
        }
        if (prop != null && !prop.isBlank()) {
            if (combined.length() > 0) {
                combined.append(java.io.File.pathSeparator);
            }
            combined.append(prop);
        }
        if (combined.length() == 0) {
            return List.of();
        }
        return Arrays.stream(combined.toString().split("[,;" + java.io.File.pathSeparator + "]"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    // ---------------------------------------------------------------------
    // Windows certificate store
    // ---------------------------------------------------------------------

    public KeyStore loadWindowsKeyStore() throws Exception {
        if (!windowsStoreSupported()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.windowsStoreUnavailable",
                    "The Windows certificate store is not available on this platform");
        }
        KeyStore ks = KeyStore.getInstance(WINDOWS_KEYSTORE_TYPE, MSCAPI_PROVIDER);
        ks.load(null, null);
        return ks;
    }

    public Provider windowsProvider() {
        return Security.getProvider(MSCAPI_PROVIDER);
    }

    public List<HardwareCertificateInfo> listWindowsCertificates() throws Exception {
        return listSigningCertificates(loadWindowsKeyStore(), SOURCE_WINDOWS_STORE);
    }

    // ---------------------------------------------------------------------
    // PKCS#11 tokens
    // ---------------------------------------------------------------------

    /**
     * A configured, logged-in PKCS#11 keystore plus the provider that must service signing. Closing
     * logs the session out so the PIN-authenticated session does not outlive the request. The
     * provider stays cached (logout is C_Logout, not C_Finalize) so the next call reuses the same
     * C_Initialize. Single-user desktop model - logout is best-effort.
     */
    public record Pkcs11Session(KeyStore keyStore, Provider provider) implements AutoCloseable {
        @Override
        public void close() {
            if (provider instanceof java.security.AuthProvider authProvider) {
                try {
                    authProvider.logout();
                } catch (Exception e) {
                    // Not logged in / already logged out - nothing to clear.
                }
            }
        }
    }

    // One SunPKCS11 provider per driver+slot, reused across enumerate + sign. A PKCS#11 module
    // typically allows C_Initialize only once per process, so configuring a fresh provider on every
    // call races with the previous (not-yet-GC'd) one - the cause of "first sign fails, second
    // works". Reusing the provider keeps a single C_Initialize alive for the session.
    private final java.util.concurrent.ConcurrentHashMap<String, Provider> pkcs11Providers =
            new java.util.concurrent.ConcurrentHashMap<>();

    public Pkcs11Session openPkcs11(String libraryPath, Integer slot, char[] pin) throws Exception {
        validateLibraryAllowed(libraryPath);
        if (!pkcs11Supported()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pkcs11Unavailable", "PKCS#11 support is not available in this runtime");
        }

        String cacheKey = libraryPath + "|" + slot;
        Provider provider =
                pkcs11Providers.computeIfAbsent(
                        cacheKey, k -> buildPkcs11Provider(libraryPath, slot));
        try {
            KeyStore ks = KeyStore.getInstance("PKCS11", provider);
            ks.load(null, pin);
            return new Pkcs11Session(ks, provider);
        } catch (Exception e) {
            // A wrong PIN must not be retried: a second C_Login would burn the token's retry
            // counter twice per attempt and can lock the token. Only rebuild on provider/init
            // failures (e.g. token removed/re-inserted leaving a stale provider).
            if (isAuthFailure(e)) {
                throw e;
            }
            pkcs11Providers.remove(cacheKey, provider);
            Provider fresh =
                    pkcs11Providers.computeIfAbsent(
                            cacheKey, k -> buildPkcs11Provider(libraryPath, slot));
            KeyStore ks = KeyStore.getInstance("PKCS11", fresh);
            ks.load(null, pin);
            return new Pkcs11Session(ks, fresh);
        }
    }

    /** True when the failure is a bad/locked PIN rather than a provider/init/device problem. */
    private static boolean isAuthFailure(Throwable t) {
        while (t != null) {
            if (t instanceof javax.security.auth.login.FailedLoginException) {
                return true;
            }
            String msg = t.getMessage();
            if (msg != null && msg.toUpperCase(Locale.ROOT).contains("CKR_PIN")) {
                return true; // CKR_PIN_INCORRECT / CKR_PIN_LOCKED / CKR_PIN_INVALID / ...
            }
            t = t.getCause();
        }
        return false;
    }

    private Provider buildPkcs11Provider(String libraryPath, Integer slot) {
        StringBuilder config = new StringBuilder();
        config.append("--name=").append(providerName(libraryPath)).append('\n');
        config.append("library=").append(libraryPath).append('\n');
        if (slot != null) {
            config.append("slot=").append(slot).append('\n');
        }
        try {
            return Security.getProvider(PKCS11_BASE_PROVIDER).configure(config.toString());
        } catch (Exception e) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pkcs11ConfigFailed",
                    "Failed to initialise the PKCS#11 driver: {0}",
                    e.getMessage());
        }
    }

    public List<HardwareCertificateInfo> listPkcs11Certificates(
            String libraryPath, Integer slot, char[] pin) throws Exception {
        try (Pkcs11Session session = openPkcs11(libraryPath, slot, pin)) {
            return listSigningCertificates(session.keyStore(), SOURCE_PKCS11);
        }
    }

    /**
     * Reject driver paths that are not detected on disk / configured - blocks arbitrary DLL loads.
     */
    public void validateLibraryAllowed(String libraryPath) {
        if (libraryPath == null || libraryPath.isBlank()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pkcs11LibraryRequired", "A PKCS#11 driver library path is required");
        }
        Set<String> allowed =
                detectPkcs11Libraries().stream()
                        .map(Pkcs11LibraryInfo::path)
                        .collect(Collectors.toSet());
        boolean ok = allowed.stream().anyMatch(p -> sameFile(p, libraryPath));
        if (!ok) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pkcs11LibraryNotAllowed",
                    "PKCS#11 driver is not in the allowed list. Add it via the"
                            + " STIRLING_PKCS11_LIBRARIES setting: {0}",
                    libraryPath);
        }
    }

    // ---------------------------------------------------------------------
    // Shared helpers
    // ---------------------------------------------------------------------

    private List<HardwareCertificateInfo> listSigningCertificates(KeyStore ks, String source)
            throws Exception {
        List<HardwareCertificateInfo> certs = new ArrayList<>();
        Enumeration<String> aliases = ks.aliases();
        while (aliases.hasMoreElements()) {
            String alias = aliases.nextElement();
            if (!ks.isKeyEntry(alias)) {
                continue; // only entries we can sign with
            }
            Certificate cert = ks.getCertificate(alias);
            if (cert instanceof X509Certificate x509) {
                certs.add(toInfo(alias, x509, source));
            }
        }
        return certs;
    }

    private static HardwareCertificateInfo toInfo(
            String alias, X509Certificate cert, String source) {
        java.util.Date now = new java.util.Date();
        return new HardwareCertificateInfo(
                alias,
                source,
                cert.getSubjectX500Principal().getName(),
                cert.getIssuerX500Principal().getName(),
                commonName(cert.getSubjectX500Principal()),
                commonName(cert.getIssuerX500Principal()),
                cert.getSerialNumber().toString(16),
                cert.getPublicKey().getAlgorithm(),
                cert.getNotBefore().toInstant().toString(),
                cert.getNotAfter().toInstant().toString(),
                now.after(cert.getNotAfter()),
                now.before(cert.getNotBefore()));
    }

    private static String commonName(X500Principal principal) {
        try {
            X500Name x500Name = new X500Name(principal.getName());
            RDN[] rdns = x500Name.getRDNs(BCStyle.CN);
            if (rdns.length > 0) {
                return IETFUtils.valueToString(rdns[0].getFirst().getValue());
            }
        } catch (Exception e) {
            log.debug("Could not parse common name from {}", principal.getName());
        }
        return principal.getName();
    }

    private static String providerName(String libraryPath) {
        String base = fileName(libraryPath).replaceAll("[^a-zA-Z0-9]", "");
        if (base.isEmpty()) {
            base = "token";
        }
        return "StirlingHW" + base;
    }

    private static String fileName(String path) {
        try {
            return Path.of(path).getFileName().toString();
        } catch (Exception e) {
            return path;
        }
    }

    private static boolean sameFile(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        try {
            Path pa = Path.of(a);
            Path pb = Path.of(b);
            if (Files.exists(pa) && Files.exists(pb)) {
                return Files.isSameFile(pa, pb);
            }
            return pa.toAbsolutePath().normalize().equals(pb.toAbsolutePath().normalize());
        } catch (Exception e) {
            return a.equalsIgnoreCase(b);
        }
    }
}
