package stirling.software.SPDF.service;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import lombok.extern.slf4j.Slf4j;

/**
 * Reads the root certificates the operating system trusts, which is where Group Policy, Intune and
 * MDM profiles deploy an organisation's own roots. Java's default trust manager reads only the
 * runtime's bundled cacerts, so those roots are invisible to it.
 *
 * <p>Windows: the {@code Windows-ROOT} store (current user's view, which includes machine and
 * policy roots). macOS: {@code KeychainStore-ROOT} (system and admin-trusted roots) plus {@code
 * KeychainStore} (user-trusted). Linux: the distribution trust bundle for email signing when the
 * distribution publishes purpose-specific bundles.
 */
@Slf4j
final class OsTrustStore {

    static final List<String> WINDOWS_STORES = List.of("Windows-ROOT");
    static final List<String> MAC_STORES = List.of("KeychainStore-ROOT", "KeychainStore");
    private static final List<Path> LINUX_PURPOSE_BUNDLE_DIRS =
            List.of(
                    Path.of("/etc/pki/ca-trust/extracted/pem"),
                    Path.of("/etc/ca-certificates/extracted"));
    private static final List<Path> LINUX_UNSCOPED_BUNDLES =
            List.of(Path.of("/etc/ssl/certs/ca-certificates.crt"));

    static final String TRUSTED_KEY_USAGE = "2.16.840.1.113894.746875.1.1";

    /** Any purpose, Apple's basic X.509 policy, and Apple's S/MIME (document signing) policy. */
    static final Set<String> SIGNING_TRUST_PURPOSES =
            Set.of("2.5.29.37.0", "1.2.840.113635.100.1.2", "1.2.840.113635.100.1.8");

    private OsTrustStore() {}

    static List<X509Certificate> load(String osName) {
        String os = osName == null ? "" : osName.toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            return fromKeyStores(WINDOWS_STORES);
        }
        if (os.contains("mac")) {
            return fromKeyStores(MAC_STORES);
        }
        return fromLinuxBundles(LINUX_PURPOSE_BUNDLE_DIRS, LINUX_UNSCOPED_BUNDLES);
    }

    static List<X509Certificate> fromKeyStores(List<String> types) {
        List<X509Certificate> certs = new ArrayList<>();
        for (String type : types) {
            try {
                KeyStore store = KeyStore.getInstance(type);
                store.load(null, null);
                List<X509Certificate> trusted = trustedCertificates(store);
                certs.addAll(trusted);
                log.debug("Read {} trusted certificates from OS store {}", trusted.size(), type);
            } catch (Exception e) {
                log.warn("Could not read OS trust store {}: {}", type, e.getMessage());
            }
        }
        return certs;
    }

    /**
     * Only trusted-certificate entries. Key entries are the user's own identities: the macOS user
     * keychain lists them alongside its trusted roots, and trusting them would make any self-signed
     * identity validate. A root whose trust is limited to other purposes, such as SSL only, is
     * dropped too.
     */
    static List<X509Certificate> trustedCertificates(KeyStore store) throws Exception {
        List<X509Certificate> certs = new ArrayList<>();
        for (String alias : Collections.list(store.aliases())) {
            if (store.isCertificateEntry(alias)
                    && store.getEntry(alias, null) instanceof KeyStore.TrustedCertificateEntry entry
                    && entry.getTrustedCertificate() instanceof X509Certificate x509
                    && trustedForSigning(entry.getAttributes())) {
                certs.add(x509);
            }
        }
        return certs;
    }

    /**
     * macOS trust settings arrive as the JDK's trusted-key-usage attribute: a policy OID, or a
     * bracketed list of them. No attribute means the store sets no purpose limit.
     */
    static boolean trustedForSigning(Set<KeyStore.Entry.Attribute> attributes) {
        for (KeyStore.Entry.Attribute attribute : attributes) {
            if (TRUSTED_KEY_USAGE.equals(attribute.getName())) {
                String value = attribute.getValue().replaceAll("[\\[\\]\\s]", "");
                return Arrays.stream(value.split(",")).anyMatch(SIGNING_TRUST_PURPOSES::contains);
            }
        }
        return true;
    }

    static List<X509Certificate> fromLinuxBundles(
            List<Path> purposeBundleDirs, List<Path> unscopedBundles) {
        List<Path> signingBundles =
                purposeBundleDirs.stream()
                        .filter(Files::isDirectory)
                        .map(dir -> dir.resolve("email-ca-bundle.pem"))
                        .toList();
        // A missing signing bundle must not widen a purpose-aware store to TLS trust.
        return fromFirstBundle(signingBundles.isEmpty() ? unscopedBundles : signingBundles);
    }

    static List<X509Certificate> fromFirstBundle(List<Path> bundles) {
        for (Path bundle : bundles) {
            if (!Files.isReadable(bundle)) {
                continue;
            }
            try (InputStream in = Files.newInputStream(bundle)) {
                List<X509Certificate> certs = new ArrayList<>();
                for (Certificate cert :
                        CertificateFactory.getInstance("X.509").generateCertificates(in)) {
                    if (cert instanceof X509Certificate x509) {
                        certs.add(x509);
                    }
                }
                log.debug("Read {} certificates from OS bundle {}", certs.size(), bundle);
                return certs;
            } catch (Exception e) {
                log.warn("Could not read OS trust bundle {}: {}", bundle, e.getMessage());
            }
        }
        log.warn("No readable OS trust bundle found in {}", bundles);
        return List.of();
    }
}
