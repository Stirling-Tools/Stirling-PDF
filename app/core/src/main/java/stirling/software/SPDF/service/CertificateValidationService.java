package stirling.software.SPDF.service;

import java.io.*;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.*;
import java.util.*;

import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

import org.bouncycastle.asn1.ASN1Encodable;
import org.bouncycastle.asn1.ASN1GeneralizedTime;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.ASN1UTCTime;
import org.bouncycastle.asn1.cms.CMSAttributes;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.tsp.TimeStampToken;
import org.bouncycastle.util.Store;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.ServerCertificateServiceInterface;

@Service
@Slf4j
public class CertificateValidationService {
    /**
     * Result container for validation time extraction Contains both the date and the source of the
     * time
     */
    public static class ValidationTime {
        public final Date date;
        public final String source; // "timestamp" | "signing-time" | "current"

        public ValidationTime(Date date, String source) {
            this.date = date;
            this.source = source;
        }
    }

    // Separate trust stores: signing vs TLS
    private KeyStore signingTrustAnchors; // AATL/EUTL + server cert for PDF signing
    private final ServerCertificateServiceInterface serverCertificateService;

    @Value("${security.validation.enableEUTL:false}")
    private boolean enableEUTL;

    @Value("${security.validation.allowAIA:true}")
    private boolean allowAIA;

    @Value("${security.validation.revocation.mode:none}")
    private String revocationMode; // none|ocsp|ocsp+crl

    @Value("${security.validation.revocation.hardFail:false}")
    private boolean revocationHardFail;

    static {
        if (java.security.Security.getProvider("BC") == null) {
            java.security.Security.addProvider(new BouncyCastleProvider());
        }
    }

    public CertificateValidationService(
            @Autowired(required = false)
                    ServerCertificateServiceInterface serverCertificateService) {
        this.serverCertificateService = serverCertificateService;
    }

    @PostConstruct
    private void initializeTrustStore() throws Exception {
        signingTrustAnchors = KeyStore.getInstance(KeyStore.getDefaultType());
        signingTrustAnchors.load(null, null);

        // Load from multiple trust sources for maximum compatibility
        loadJavaSystemTrustStore(); // Java's cacerts (includes OS trust store on Windows)
        loadBundledMozillaCACerts(); // Mozilla CA bundle (MPL 2.0)

        // Load trust anchors for PDF signing
        loadServerCertAsAnchor();

        // Optional: EUTL (EU Trust List)
        if (enableEUTL) loadEUTLCertificates();

        // Note: For network-based revocation checking (OCSP/CRL fetching), configure JVM
        // properties:
        // -Dcom.sun.security.enableCRLDP=true
        // -Dcom.sun.security.enableAIAcaIssuers=true
        // And Security.setProperty("ocsp.enable", "true") at JVM startup
    }

    /**
     * Core entry-point: build a valid PKIX path from signerCert using provided intermediates
     *
     * @param signerCert The signer certificate
     * @param intermediates Collection of intermediate certificates from CMS
     * @param customTrustAnchor Optional custom root/intermediate certificate
     * @param validationTime Time to validate at (signing time or current)
     * @return PKIXCertPathBuilderResult containing validated path
     * @throws GeneralSecurityException if path building/validation fails
     */
    public PKIXCertPathBuilderResult buildAndValidatePath(
            X509Certificate signerCert,
            Collection<X509Certificate> intermediates,
            X509Certificate customTrustAnchor,
            Date validationTime)
            throws GeneralSecurityException {

        // Build trust anchors
        Set<TrustAnchor> anchors = new HashSet<>();
        if (customTrustAnchor != null) {
            anchors.add(new TrustAnchor(customTrustAnchor, null));
        } else {
            Enumeration<String> aliases = signingTrustAnchors.aliases();
            while (aliases.hasMoreElements()) {
                Certificate c = signingTrustAnchors.getCertificate(aliases.nextElement());
                if (c instanceof X509Certificate x) {
                    anchors.add(new TrustAnchor(x, null));
                }
            }
        }
        if (anchors.isEmpty()) {
            throw new CertPathBuilderException("No trust anchors available");
        }

        // Target certificate selector
        X509CertSelector target = new X509CertSelector();
        target.setCertificate(signerCert);

        // Intermediate certificate store
        List<Certificate> allCerts = new ArrayList<>(intermediates);
        CertStore intermediateStore =
                CertStore.getInstance("Collection", new CollectionCertStoreParameters(allCerts));

        // PKIX parameters
        PKIXBuilderParameters params = new PKIXBuilderParameters(anchors, target);
        params.addCertStore(intermediateStore);
        params.setRevocationEnabled(!"none".equalsIgnoreCase(revocationMode));
        if (validationTime != null) {
            params.setDate(validationTime);
        }

        // Revocation checking
        if (!"none".equalsIgnoreCase(revocationMode)) {
            try {
                PKIXRevocationChecker rc =
                        (PKIXRevocationChecker)
                                CertPathValidator.getInstance("PKIX").getRevocationChecker();

                Set<PKIXRevocationChecker.Option> options =
                        EnumSet.noneOf(PKIXRevocationChecker.Option.class);

                // Soft-fail: allow validation to succeed if revocation status unavailable
                if (!revocationHardFail) {
                    options.add(PKIXRevocationChecker.Option.SOFT_FAIL);
                }

                // Revocation mode configuration
                if ("ocsp".equalsIgnoreCase(revocationMode)) {
                    // OCSP-only: prefer OCSP (default), disable fallback to CRL
                    options.add(PKIXRevocationChecker.Option.NO_FALLBACK);
                } else if ("crl".equalsIgnoreCase(revocationMode)) {
                    // CRL-only: prefer CRLs, disable fallback to OCSP
                    options.add(PKIXRevocationChecker.Option.PREFER_CRLS);
                    options.add(PKIXRevocationChecker.Option.NO_FALLBACK);
                }
                // "ocsp+crl" or other: use defaults (try OCSP first, fallback to CRL)

                rc.setOptions(options);
                params.addCertPathChecker(rc);
            } catch (Exception e) {
                log.warn("Failed to configure revocation checker: {}", e.getMessage());
            }
        }

        // Build path
        CertPathBuilder builder = CertPathBuilder.getInstance("PKIX");
        return (PKIXCertPathBuilderResult) builder.build(params);
    }

    /**
     * Extract validation time from signature (TSA timestamp or signingTime)
     *
     * @param signerInfo The CMS signer information
     * @return ValidationTime containing date and source, or null if not found
     */
    public ValidationTime extractValidationTime(SignerInformation signerInfo) {
        try {
            // 1) Check for timestamp token (RFC 3161) - highest priority
            var unsignedAttrs = signerInfo.getUnsignedAttributes();
            if (unsignedAttrs != null) {
                var attr =
                        unsignedAttrs.get(new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.2.14"));
                if (attr != null) {
                    try {
                        TimeStampToken tst =
                                new TimeStampToken(
                                        new CMSSignedData(
                                                attr.getAttributeValues()[0]
                                                        .toASN1Primitive()
                                                        .getEncoded()));
                        Date tstTime = tst.getTimeStampInfo().getGenTime();
                        log.debug("Using timestamp token time: {}", tstTime);
                        return new ValidationTime(tstTime, "timestamp");
                    } catch (Exception e) {
                        log.debug("Failed to parse timestamp token: {}", e.getMessage());
                    }
                }
            }

            // 2) Check for signingTime attribute - fallback
            var signedAttrs = signerInfo.getSignedAttributes();
            if (signedAttrs != null) {
                var st = signedAttrs.get(CMSAttributes.signingTime);
                if (st != null) {
                    ASN1Encodable val = st.getAttributeValues()[0];
                    Date signingTime = null;
                    if (val instanceof ASN1UTCTime ut) {
                        signingTime = ut.getDate();
                    } else if (val instanceof ASN1GeneralizedTime gt) {
                        signingTime = gt.getDate();
                    }
                    if (signingTime != null) {
                        log.debug("Using signingTime attribute: {}", signingTime);
                        return new ValidationTime(signingTime, "signing-time");
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Error extracting validation time: {}", e.getMessage());
        }
        return null;
    }

    /**
     * Check if certificate is outside validity period at given time
     *
     * @param cert Certificate to check
     * @param at Time to check validity
     * @return true if certificate is expired or not yet valid
     */
    public boolean isOutsideValidityPeriod(X509Certificate cert, Date at) {
        try {
            cert.checkValidity(at);
            return false;
        } catch (CertificateExpiredException | CertificateNotYetValidException e) {
            return true;
        }
    }

    /**
     * Check if revocation checking is enabled
     *
     * @return true if revocation mode is not "none"
     */
    public boolean isRevocationEnabled() {
        return !"none".equalsIgnoreCase(revocationMode);
    }

    /**
     * Check if certificate is a CA certificate
     *
     * @param cert Certificate to check
     * @return true if certificate has basicConstraints with CA=true
     */
    public boolean isCA(X509Certificate cert) {
        return cert.getBasicConstraints() >= 0;
    }

    /**
     * Verify if certificate is self-signed by checking signature
     *
     * @param cert Certificate to check
     * @return true if certificate is self-signed and signature is valid
     */
    public boolean isSelfSigned(X509Certificate cert) {
        try {
            if (!cert.getSubjectX500Principal().equals(cert.getIssuerX500Principal())) {
                return false;
            }
            cert.verify(cert.getPublicKey());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Calculate SHA-256 fingerprint of certificate
     *
     * @param cert Certificate
     * @return Hex string of SHA-256 hash
     */
    public String sha256Fingerprint(X509Certificate cert) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(cert.getEncoded());
            return bytesToHex(hash);
        } catch (Exception e) {
            return "";
        }
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02X", b));
        }
        return sb.toString();
    }

    /**
     * Extract all certificates from CMS signature store
     *
     * @param certStore BouncyCastle certificate store
     * @param signerCert The signer certificate
     * @return Collection of all certificates except signer
     */
    public Collection<X509Certificate> extractIntermediateCertificates(
            Store<X509CertificateHolder> certStore, X509Certificate signerCert) {
        List<X509Certificate> intermediates = new ArrayList<>();
        try {
            JcaX509CertificateConverter converter = new JcaX509CertificateConverter();
            Collection<X509CertificateHolder> holders = certStore.getMatches(null);

            for (X509CertificateHolder holder : holders) {
                X509Certificate cert = converter.getCertificate(holder);
                if (!cert.equals(signerCert)) {
                    intermediates.add(cert);
                }
            }
        } catch (Exception e) {
            log.debug("Error extracting intermediate certificates: {}", e.getMessage());
        }
        return intermediates;
    }

    // ==================== Trust Store Loading ====================

    /**
     * Load certificates from Java's system trust store (cacerts). On Windows, this includes
     * certificates from the Windows trust store. This provides maximum compatibility with what
     * browsers and OS trust.
     */
    private void loadJavaSystemTrustStore() {
        try {
            log.info("Loading certificates from Java system trust store");

            // Get default trust manager factory
            TrustManagerFactory tmf =
                    TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init((KeyStore) null); // null = use system default

            // Extract certificates from trust managers
            int loadedCount = 0;
            for (TrustManager tm : tmf.getTrustManagers()) {
                if (tm instanceof X509TrustManager x509tm) {
                    for (X509Certificate cert : x509tm.getAcceptedIssuers()) {
                        if (isCA(cert)) {
                            String fingerprint = sha256Fingerprint(cert);
                            String alias = "system-" + fingerprint;
                            signingTrustAnchors.setCertificateEntry(alias, cert);
                            loadedCount++;
                        }
                    }
                }
            }

            log.info("Loaded {} CA certificates from Java system trust store", loadedCount);
        } catch (Exception e) {
            log.error("Failed to load Java system trust store: {}", e.getMessage(), e);
        }
    }

    /**
     * Load bundled Mozilla CA certificate bundle from resources. This bundle contains ~140 trusted
     * root CAs from Mozilla's CA Certificate Program, suitable for validating most commercial PDF
     * signatures.
     */
    private void loadBundledMozillaCACerts() {
        try {
            log.info("Loading bundled Mozilla CA certificates from resources");
            InputStream certStream =
                    getClass().getClassLoader().getResourceAsStream("certs/cacert.pem");
            if (certStream == null) {
                log.warn("Bundled Mozilla CA certificate file not found in resources");
                return;
            }

            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            Collection<? extends Certificate> certs = cf.generateCertificates(certStream);
            certStream.close();

            int loadedCount = 0;
            int skippedCount = 0;

            for (Certificate cert : certs) {
                if (cert instanceof X509Certificate x509) {
                    // Only add CA certificates to trust anchors
                    if (isCA(x509)) {
                        String fingerprint = sha256Fingerprint(x509);
                        String alias = "mozilla-" + fingerprint;
                        signingTrustAnchors.setCertificateEntry(alias, x509);
                        loadedCount++;
                    } else {
                        skippedCount++;
                    }
                }
            }

            log.info(
                    "Loaded {} Mozilla CA certificates as trust anchors (skipped {} non-CA certs)",
                    loadedCount,
                    skippedCount);
        } catch (Exception e) {
            log.error("Failed to load bundled Mozilla CA certificates: {}", e.getMessage(), e);
        }
    }

    private void loadServerCertAsAnchor() {
        try {
            if (serverCertificateService != null
                    && serverCertificateService.isEnabled()
                    && serverCertificateService.hasServerCertificate()) {
                X509Certificate serverCert = serverCertificateService.getServerCertificate();

                // Self-signed certificates can be trust anchors regardless of CA flag
                // Non-self-signed certificates should only be trust anchors if they're CAs
                boolean selfSigned = isSelfSigned(serverCert);
                boolean ca = isCA(serverCert);

                if (selfSigned || ca) {
                    signingTrustAnchors.setCertificateEntry("server-anchor", serverCert);
                    log.info(
                            "Loaded server certificate as trust anchor (self-signed: {}, CA: {})",
                            selfSigned,
                            ca);
                } else {
                    log.warn(
                            "Server certificate is neither self-signed nor a CA; not adding as trust anchor");
                }
            }
        } catch (Exception e) {
            log.warn("Failed loading server certificate as anchor: {}", e.getMessage());
        }
    }

    private void loadEUTLCertificates() {
        // TODO: Implement EUTL loading (ETSI TS 119 612 format)
        log.info("EUTL loading not yet implemented");
    }

    // ==================== Legacy/Compatibility Methods ====================

    /**
     * @deprecated Use buildAndValidatePath() instead
     */
    @Deprecated
    public boolean validateCertificateChain(X509Certificate cert) {
        try {
            buildAndValidatePath(cert, Collections.emptyList(), null, new Date());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * @deprecated Use buildAndValidatePath() with custom anchor
     */
    @Deprecated
    public boolean validateCertificateChainWithCustomCert(
            X509Certificate cert, X509Certificate customCert) {
        try {
            buildAndValidatePath(cert, Collections.emptyList(), customCert, new Date());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * @deprecated Use isOutsideValidityPeriod()
     */
    @Deprecated
    public boolean isRevoked(X509Certificate cert) {
        return isOutsideValidityPeriod(cert, new Date());
    }

    /** Get signing trust store */
    public KeyStore getSigningTrustStore() {
        return signingTrustAnchors;
    }
}
