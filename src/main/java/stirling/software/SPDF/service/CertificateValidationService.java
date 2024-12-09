package stirling.software.SPDF.service;

import io.github.pixee.security.BoundedLineReader;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.cert.CertPath;
import java.security.cert.CertPathValidator;
import java.security.cert.CertificateExpiredException;
import java.security.cert.CertificateFactory;
import java.security.cert.CertificateNotYetValidException;
import java.security.cert.PKIXParameters;
import java.security.cert.TrustAnchor;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

@Service
public class CertificateValidationService {
    private KeyStore trustStore;

    @PostConstruct
    private void initializeTrustStore() throws Exception {
        trustStore = KeyStore.getInstance(KeyStore.getDefaultType());
        trustStore.load(null, null);
        loadMozillaCertificates();
    }

    private void loadMozillaCertificates() throws Exception {
        try (InputStream is = getClass().getResourceAsStream("/certdata.txt")) {
            BufferedReader reader = new BufferedReader(new InputStreamReader(is));
            String line;
            StringBuilder certData = new StringBuilder();
            boolean inCert = false;
            int certCount = 0;

            while ((line = BoundedLineReader.readLine(reader, 5_000_000)) != null) {
                if (line.startsWith("CKA_VALUE MULTILINE_OCTAL")) {
                    inCert = true;
                    certData = new StringBuilder();
                    continue;
                }
                if (inCert) {
                    if ("END".equals(line)) {
                        inCert = false;
                        byte[] certBytes = parseOctalData(certData.toString());
                        if (certBytes != null) {
                            CertificateFactory cf = CertificateFactory.getInstance("X.509");
                            X509Certificate cert =
                                    (X509Certificate)
                                            cf.generateCertificate(
                                                    new ByteArrayInputStream(certBytes));
                            trustStore.setCertificateEntry("mozilla-cert-" + certCount++, cert);
                        }
                    } else {
                        certData.append(line).append("\n");
                    }
                }
            }
        }
    }

    private byte[] parseOctalData(String data) {
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            String[] tokens = data.split("\\\\");
            for (String token : tokens) {
                token = token.trim();
                if (!token.isEmpty()) {
                    baos.write(Integer.parseInt(token, 8));
                }
            }
            return baos.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    public boolean validateCertificateChain(X509Certificate cert) {
        try {
            CertPathValidator validator = CertPathValidator.getInstance("PKIX");
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            List<X509Certificate> certList = Arrays.asList(cert);
            CertPath certPath = cf.generateCertPath(certList);

            Set<TrustAnchor> anchors = new HashSet<>();
            Enumeration<String> aliases = trustStore.aliases();
            while (aliases.hasMoreElements()) {
                Object trustCert = trustStore.getCertificate(aliases.nextElement());
                if (trustCert instanceof X509Certificate) {
                    anchors.add(new TrustAnchor((X509Certificate) trustCert, null));
                }
            }

            PKIXParameters params = new PKIXParameters(anchors);
            params.setRevocationEnabled(false);
            validator.validate(certPath, params);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean validateTrustStore(X509Certificate cert) {
        try {
            Enumeration<String> aliases = trustStore.aliases();
            while (aliases.hasMoreElements()) {
                Object trustCert = trustStore.getCertificate(aliases.nextElement());
                if (trustCert instanceof X509Certificate && cert.equals(trustCert)) {
                    return true;
                }
            }
            return false;
        } catch (KeyStoreException e) {
            return false;
        }
    }

    public boolean isRevoked(X509Certificate cert) {
        try {
            cert.checkValidity();
            return false;
        } catch (CertificateExpiredException | CertificateNotYetValidException e) {
            return true;
        }
    }

    public boolean validateCertificateChainWithCustomCert(
            X509Certificate cert, X509Certificate customCert) {
        try {
            cert.verify(customCert.getPublicKey());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean validateTrustWithCustomCert(X509Certificate cert, X509Certificate customCert) {
        try {
            // Compare the issuer of the signature certificate with the custom certificate
            return cert.getIssuerX500Principal().equals(customCert.getSubjectX500Principal());
        } catch (Exception e) {
            return false;
        }
    }
}
