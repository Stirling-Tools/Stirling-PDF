package stirling.software.proprietary.workflow.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.PrivateKey;
import java.security.UnrecoverableKeyException;
import java.security.cert.Certificate;
import java.security.cert.CertificateExpiredException;
import java.security.cert.CertificateNotYetValidException;
import java.security.cert.X509Certificate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Enumeration;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.PdfSigningService;
import stirling.software.proprietary.workflow.dto.CertificateInfo;

/**
 * Validates a certificate submission before it is stored in participant metadata. Catches issues
 * (wrong password, expired cert, algorithm incompatibility) at signing time rather than days later
 * at finalization.
 *
 * <p>The core check is a test-sign of a minimal blank PDF using the exact same {@link
 * PdfSigningService} code path used at finalization, so any failure that would block finalization
 * is caught here first.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CertificateSubmissionValidator {

    private static final DateTimeFormatter DATE_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z").withZone(ZoneId.systemDefault());

    private final PdfSigningService pdfSigningService;

    /**
     * Validates a certificate submission end-to-end by:
     *
     * <ol>
     *   <li>Loading the keystore with the provided password
     *   <li>Checking certificate validity (expiry, not-yet-valid)
     *   <li>Test-signing a blank PDF to confirm the key and certificate are fully functional
     * </ol>
     *
     * @param keystoreBytes raw bytes of the keystore file
     * @param certType "P12", "PKCS12", "PFX", or "JKS" (case-insensitive)
     * @param password keystore password (may be null or empty)
     * @return {@link CertificateInfo} with subject, issuer, and validity dates on success
     * @throws ResponseStatusException HTTP 400 with a user-friendly message on any failure
     */
    public CertificateInfo validateAndExtractInfo(
            byte[] keystoreBytes, String certType, String password) {
        if (certType == null
                || "SERVER".equalsIgnoreCase(certType)
                || "USER_CERT".equalsIgnoreCase(certType)) {
            // Server-managed or pre-configured user certificate — no file uploaded, nothing to
            // validate
            return null;
        }

        char[] passwordChars = password != null ? password.toCharArray() : new char[0];

        KeyStore keystore = loadKeyStore(keystoreBytes, certType, passwordChars);
        X509Certificate cert = extractSigningCert(keystore, passwordChars);

        validateCertValidity(cert);

        String subjectName = extractCN(cert.getSubjectX500Principal().getName());
        String issuerName = extractCN(cert.getIssuerX500Principal().getName());
        boolean selfSigned = cert.getSubjectX500Principal().equals(cert.getIssuerX500Principal());

        testSign(keystore, passwordChars, subjectName);

        return new CertificateInfo(
                subjectName, issuerName, cert.getNotBefore(), cert.getNotAfter(), selfSigned);
    }

    // ---- private helpers ----

    private KeyStore loadKeyStore(byte[] bytes, String certType, char[] password) {
        String keystoreType = resolveKeystoreType(certType);
        try {
            KeyStore ks = KeyStore.getInstance(keystoreType);
            ks.load(new java.io.ByteArrayInputStream(bytes), password);
            return ks;
        } catch (IOException e) {
            // PKCS12: wrong password produces an IOException with "keystore password was incorrect"
            // JKS: wrong password produces IOException wrapping UnrecoverableKeyException
            log.debug("Failed to load {} keystore: {}", keystoreType, e.getMessage());
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid certificate password or corrupt keystore file");
        } catch (Exception e) {
            log.debug("Failed to instantiate {} keystore: {}", keystoreType, e.getMessage());
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid certificate password or corrupt keystore file");
        }
    }

    private X509Certificate extractSigningCert(KeyStore keystore, char[] password) {
        try {
            Enumeration<String> aliases = keystore.aliases();
            while (aliases.hasMoreElements()) {
                String alias = aliases.nextElement();
                PrivateKey key = null;
                try {
                    key = (PrivateKey) keystore.getKey(alias, password);
                } catch (UnrecoverableKeyException | java.security.NoSuchAlgorithmException e) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Invalid certificate password or corrupt keystore file");
                }
                if (key == null) continue;

                Certificate[] chain = keystore.getCertificateChain(alias);
                if (chain != null && chain.length > 0 && chain[0] instanceof X509Certificate) {
                    return (X509Certificate) chain[0];
                }
            }
        } catch (ResponseStatusException e) {
            throw e;
        } catch (KeyStoreException e) {
            log.debug("KeyStore alias enumeration failed: {}", e.getMessage());
        }
        throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "No private key found in the provided keystore");
    }

    private void validateCertValidity(X509Certificate cert) {
        try {
            cert.checkValidity();
        } catch (CertificateExpiredException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Certificate has expired (expired: "
                            + DATE_FORMAT.format(cert.getNotAfter().toInstant())
                            + ")");
        } catch (CertificateNotYetValidException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Certificate is not yet valid (valid from: "
                            + DATE_FORMAT.format(cert.getNotBefore().toInstant())
                            + ")");
        }
    }

    private void testSign(KeyStore keystore, char[] password, String signerName) {
        try {
            byte[] blankPdf = createBlankPdf();
            pdfSigningService.signWithKeystore(
                    blankPdf, keystore, password, false, null, signerName, null, null, false);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.debug("Certificate test-sign failed: {}", e.getMessage());
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Certificate is not compatible with the signing algorithm: " + e.getMessage());
        }
    }

    /** Creates a minimal valid 1-page blank PDF for use in test-signing. */
    private byte[] createBlankPdf() throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            doc.addPage(new PDPage());
            doc.save(out);
            return out.toByteArray();
        }
    }

    /**
     * Maps the user-facing certType string to a JCA KeyStore type string.
     *
     * <p>All PKCS12 variants ("P12", "PKCS12", "PFX") map to {@code "PKCS12"}. {@code "JKS"} maps
     * to {@code "JKS"}.
     */
    private String resolveKeystoreType(String certType) {
        if (certType == null) return "PKCS12";
        return switch (certType.toUpperCase()) {
            case "JKS" -> "JKS";
            default -> "PKCS12"; // P12, PKCS12, PFX
        };
    }

    /**
     * Extracts the CN value from an X.500 distinguished name string. Falls back to the full DN if
     * no CN attribute is present.
     */
    private String extractCN(String dn) {
        if (dn == null) return "";
        for (String part : dn.split(",")) {
            String trimmed = part.trim();
            if (trimmed.toUpperCase().startsWith("CN=")) {
                return trimmed.substring(3);
            }
        }
        return dn;
    }
}
