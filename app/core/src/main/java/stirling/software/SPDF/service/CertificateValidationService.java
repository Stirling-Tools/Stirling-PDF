package stirling.software.SPDF.service;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.*;
import java.util.*;

import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
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
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
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
    private final ApplicationProperties applicationProperties;

    // EUTL (EU Trusted List) constants
    private static final String NS_TSL = "http://uri.etsi.org/02231/v2#";

    // Qualified CA service types to import as trust anchors (per ETSI TS 119 612)
    private static final Set<String> EUTL_SERVICE_TYPES =
            new HashSet<>(
                    Arrays.asList(
                            "http://uri.etsi.org/TrstSvc/Svctype/CA/QC",
                            "http://uri.etsi.org/TrstSvc/Svctype/NationalRootCA-QC"));

    // Active statuses to accept (per ETSI TS 119 612)
    private static final String STATUS_UNDER_SUPERVISION =
            "http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/undersupervision";
    private static final String STATUS_ACCREDITED =
            "http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/accredited";
    private static final String STATUS_SUPERVISION_IN_CESSATION =
            "http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/supervisionincessation";

    static {
        if (java.security.Security.getProvider("BC") == null) {
            java.security.Security.addProvider(new BouncyCastleProvider());
        }
    }

    public CertificateValidationService(
            @Autowired(required = false) ServerCertificateServiceInterface serverCertificateService,
            ApplicationProperties applicationProperties) {
        this.serverCertificateService = serverCertificateService;
        this.applicationProperties = applicationProperties;
    }

    @PostConstruct
    private void initializeTrustStore() throws Exception {
        signingTrustAnchors = KeyStore.getInstance(KeyStore.getDefaultType());
        signingTrustAnchors.load(null, null);

        ApplicationProperties.Security.Validation validation =
                applicationProperties.getSecurity().getValidation();

        // Enable JDK fetching of OCSP/CRLDP if allowed
        if (validation.isAllowAIA()) {
            java.security.Security.setProperty("ocsp.enable", "true");
            System.setProperty("com.sun.security.enableCRLDP", "true");
            System.setProperty("com.sun.security.enableAIAcaIssuers", "true");
            log.info("Enabled AIA certificate fetching and revocation checking");
        }

        // Trust only what we explicitly opt into:
        if (validation.getTrust().isServerAsAnchor()) loadServerCertAsAnchor();
        if (validation.getTrust().isUseSystemTrust()) loadJavaSystemTrustStore();
        if (validation.getTrust().isUseMozillaBundle()) loadBundledMozillaCACerts();
        if (validation.getTrust().isUseAATL()) loadAATLCertificates();
        if (validation.getTrust().isUseEUTL()) loadEUTLCertificates();
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
        String revocationMode =
                applicationProperties.getSecurity().getValidation().getRevocation().getMode();
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
                boolean revocationHardFail =
                        applicationProperties
                                .getSecurity()
                                .getValidation()
                                .getRevocation()
                                .isHardFail();
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
        String revocationMode =
                applicationProperties.getSecurity().getValidation().getRevocation().getMode();
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
            try (InputStream certStream =
                    getClass().getClassLoader().getResourceAsStream("certs/cacert.pem")) {
                if (certStream == null) {
                    log.debug(
                            "Bundled Mozilla CA certificate file not found in resources — using Java system trust store only");
                    return;
                }

                CertificateFactory cf = CertificateFactory.getInstance("X.509");
                Collection<? extends Certificate> certs = cf.generateCertificates(certStream);

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
            }
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

    /** Download and parse Adobe Approved Trust List (AATL) and add CA certs as trust anchors. */
    private void loadAATLCertificates() {
        try {
            String aatlUrl = applicationProperties.getSecurity().getValidation().getAatl().getUrl();
            log.info("Loading Adobe Approved Trust List (AATL) from: {}", aatlUrl);
            byte[] pdfBytes = downloadTrustList(aatlUrl);
            if (pdfBytes == null) {
                log.warn("AATL download returned no data");
                return;
            }
            int added = parseAATLPdf(pdfBytes);
            log.info("Loaded {} AATL CA certificates into signing trust", added);
        } catch (Exception e) {
            log.warn("Failed to load AATL: {}", e.getMessage());
            log.debug("AATL loading error", e);
        }
    }

    /** Simple HTTP(S) fetch with sane timeouts. */
    private byte[] downloadTrustList(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = URI.create(urlStr).toURL();
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(30_000);
            conn.setInstanceFollowRedirects(true);

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_OK) {
                try (InputStream in = conn.getInputStream();
                        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[8192];
                    int r;
                    while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
                    return out.toByteArray();
                }
            } else {
                log.warn("AATL download failed: HTTP {}", code);
                return null;
            }
        } catch (Exception e) {
            log.warn("AATL download error: {}", e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * Parse AATL PDF, extract the embedded "SecuritySettings.xml", and import CA certs. Returns the
     * number of newly-added CA certificates.
     */
    private int parseAATLPdf(byte[] pdfBytes) throws Exception {
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            PDDocumentNameDictionary names = doc.getDocumentCatalog().getNames();
            if (names == null) {
                log.warn("AATL PDF has no name dictionary");
                return 0;
            }

            PDEmbeddedFilesNameTreeNode efRoot = names.getEmbeddedFiles();
            if (efRoot == null) {
                log.warn("AATL PDF has no embedded files");
                return 0;
            }

            // 1) Try names at root level
            Map<String, PDComplexFileSpecification> top = efRoot.getNames();
            if (top != null) {
                Integer count = tryParseSecuritySettingsXML(top);
                if (count != null) return count;
            }

            // 2) Traverse kids (name-tree)
            @SuppressWarnings("unchecked")
            List<?> kids = efRoot.getKids();
            if (kids != null) {
                for (Object kidObj : kids) {
                    if (kidObj instanceof PDEmbeddedFilesNameTreeNode) {
                        PDEmbeddedFilesNameTreeNode kid = (PDEmbeddedFilesNameTreeNode) kidObj;
                        Map<String, PDComplexFileSpecification> map = kid.getNames();
                        if (map != null) {
                            Integer count = tryParseSecuritySettingsXML(map);
                            if (count != null) return count;
                        }
                    }
                }
            }

            log.warn("AATL PDF did not contain SecuritySettings.xml");
            return 0;
        }
    }

    /**
     * Try to locate "SecuritySettings.xml" in the given name map. If found and parsed, returns the
     * number of certs added; otherwise returns null.
     */
    private Integer tryParseSecuritySettingsXML(Map<String, PDComplexFileSpecification> nameMap) {
        PDComplexFileSpecification fileSpec = nameMap.get("SecuritySettings.xml");
        if (fileSpec == null) return null;

        PDEmbeddedFile ef = fileSpec.getEmbeddedFile();
        if (ef == null) return null;

        try (InputStream xmlStream = ef.createInputStream()) {
            return parseSecuritySettingsXML(xmlStream);
        } catch (Exception e) {
            log.warn("Failed parsing SecuritySettings.xml: {}", e.getMessage());
            log.debug("SecuritySettings.xml parse error", e);
            return null;
        }
    }

    /**
     * Parse the SecuritySettings.xml and load only CA certificates (basicConstraints >= 0). Returns
     * the number of newly-added CA certificates.
     */
    private int parseSecuritySettingsXML(InputStream xmlStream) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature(javax.xml.XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);

        DocumentBuilder builder = factory.newDocumentBuilder();
        Document doc = builder.parse(xmlStream);

        NodeList certNodes = doc.getElementsByTagName("Certificate");
        CertificateFactory cf = CertificateFactory.getInstance("X.509");

        int added = 0;
        for (int i = 0; i < certNodes.getLength(); i++) {
            String base64 = certNodes.item(i).getTextContent().trim();
            if (base64.isEmpty()) continue;

            try {
                byte[] certBytes = java.util.Base64.getMimeDecoder().decode(base64);
                X509Certificate cert =
                        (X509Certificate)
                                cf.generateCertificate(new ByteArrayInputStream(certBytes));

                // Only add CA certs as anchors
                if (isCA(cert)) {
                    String fingerprint = sha256Fingerprint(cert);
                    String alias = "aatl-" + fingerprint;

                    // avoid duplicates
                    if (signingTrustAnchors.getCertificate(alias) == null) {
                        signingTrustAnchors.setCertificateEntry(alias, cert);
                        added++;
                    }
                } else {
                    log.debug(
                            "Skipping non-CA certificate from AATL: {}",
                            cert.getSubjectX500Principal().getName());
                }
            } catch (Exception e) {
                log.debug("Failed to parse an AATL certificate node: {}", e.getMessage());
            }
        }
        return added;
    }

    /**
     * Download LOTL (List Of Trusted Lists), resolve national TSLs, and import qualified CA
     * certificates.
     */
    private void loadEUTLCertificates() {
        try {
            String lotlUrl =
                    applicationProperties.getSecurity().getValidation().getEutl().getLotlUrl();
            log.info("Loading EU Trusted List (LOTL) from: {}", lotlUrl);
            byte[] lotlBytes = downloadXml(lotlUrl);
            if (lotlBytes == null) {
                log.warn("LOTL download returned no data");
                return;
            }

            List<String> tslUrls = parseLotlForTslLocations(lotlBytes);
            log.info("Found {} national TSL locations in LOTL", tslUrls.size());

            int totalAdded = 0;
            for (String tslUrl : tslUrls) {
                try {
                    byte[] tslBytes = downloadXml(tslUrl);
                    if (tslBytes == null) {
                        log.warn("TSL download failed: {}", tslUrl);
                        continue;
                    }
                    int added = parseTslAndAddCas(tslBytes, tslUrl);
                    totalAdded += added;
                } catch (Exception e) {
                    log.warn("Failed to parse TSL {}: {}", tslUrl, e.getMessage());
                    log.debug("TSL parse error", e);
                }
            }

            log.info("Imported {} qualified CA certificates from EUTL", totalAdded);
        } catch (Exception e) {
            log.warn("EUTL load failed: {}", e.getMessage());
            log.debug("EUTL load error", e);
        }
    }

    /** HTTP(S) GET for XML with sane timeouts. */
    private byte[] downloadXml(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = URI.create(urlStr).toURL();
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(30_000);
            conn.setInstanceFollowRedirects(true);

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_OK) {
                try (InputStream in = conn.getInputStream();
                        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[8192];
                    int r;
                    while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
                    return out.toByteArray();
                }
            } else {
                log.warn("XML download failed: HTTP {} for {}", code, urlStr);
                return null;
            }
        } catch (Exception e) {
            log.warn("XML download error for {}: {}", urlStr, e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Parse LOTL and return all TSL URLs from PointersToOtherTSL. */
    private List<String> parseLotlForTslLocations(byte[] lotlBytes) throws Exception {
        DocumentBuilderFactory dbf = secureDbfWithNamespaces();
        DocumentBuilder db = dbf.newDocumentBuilder();
        Document doc = db.parse(new ByteArrayInputStream(lotlBytes));

        List<String> out = new ArrayList<>();
        NodeList ptrs = doc.getElementsByTagNameNS(NS_TSL, "PointersToOtherTSL");
        if (ptrs.getLength() == 0) return out;

        org.w3c.dom.Element ptrRoot = (org.w3c.dom.Element) ptrs.item(0);
        NodeList locations = ptrRoot.getElementsByTagNameNS(NS_TSL, "TSLLocation");
        for (int i = 0; i < locations.getLength(); i++) {
            String url = locations.item(i).getTextContent().trim();
            if (!url.isEmpty()) out.add(url);
        }
        return out;
    }

    /**
     * Parse a single national TSL, import CA certificates for qualified services in an active
     * status. Returns count of newly added CA certs.
     */
    private int parseTslAndAddCas(byte[] tslBytes, String sourceUrl) throws Exception {
        DocumentBuilderFactory dbf = secureDbfWithNamespaces();
        DocumentBuilder db = dbf.newDocumentBuilder();
        Document doc = db.parse(new ByteArrayInputStream(tslBytes));

        int added = 0;

        NodeList services = doc.getElementsByTagNameNS(NS_TSL, "TSPService");
        for (int i = 0; i < services.getLength(); i++) {
            org.w3c.dom.Element svc = (org.w3c.dom.Element) services.item(i);
            org.w3c.dom.Element info = firstChildNS(svc, "ServiceInformation");
            if (info == null) continue;

            String type = textOf(info, "ServiceTypeIdentifier");
            if (!EUTL_SERVICE_TYPES.contains(type)) continue;

            String status = textOf(info, "ServiceStatus");
            if (!isActiveStatus(status)) continue;

            org.w3c.dom.Element sdi = firstChildNS(info, "ServiceDigitalIdentity");
            if (sdi == null) continue;

            NodeList digitalIds = sdi.getElementsByTagNameNS(NS_TSL, "DigitalId");
            for (int d = 0; d < digitalIds.getLength(); d++) {
                org.w3c.dom.Element did = (org.w3c.dom.Element) digitalIds.item(d);
                NodeList certNodes = did.getElementsByTagNameNS(NS_TSL, "X509Certificate");
                for (int c = 0; c < certNodes.getLength(); c++) {
                    String base64 = certNodes.item(c).getTextContent().trim();
                    if (base64.isEmpty()) continue;

                    try {
                        byte[] certBytes = java.util.Base64.getMimeDecoder().decode(base64);
                        CertificateFactory cf = CertificateFactory.getInstance("X.509");
                        X509Certificate cert =
                                (X509Certificate)
                                        cf.generateCertificate(new ByteArrayInputStream(certBytes));

                        if (!isCA(cert)) {
                            log.debug(
                                    "Skipping non-CA in TSL {}: {}",
                                    sourceUrl,
                                    cert.getSubjectX500Principal().getName());
                            continue;
                        }

                        String fp = sha256Fingerprint(cert);
                        String alias = "eutl-" + fp;

                        if (signingTrustAnchors.getCertificate(alias) == null) {
                            signingTrustAnchors.setCertificateEntry(alias, cert);
                            added++;
                        }
                    } catch (Exception e) {
                        log.debug(
                                "Failed to import a certificate from {}: {}",
                                sourceUrl,
                                e.getMessage());
                    }
                }
            }
        }

        log.debug("TSL {} → imported {} CA certificates", sourceUrl, added);
        return added;
    }

    /** Check if service status is active (per ETSI TS 119 612). */
    private boolean isActiveStatus(String statusUri) {
        if (STATUS_UNDER_SUPERVISION.equals(statusUri)) return true;
        if (STATUS_ACCREDITED.equals(statusUri)) return true;
        boolean acceptTransitional =
                applicationProperties
                        .getSecurity()
                        .getValidation()
                        .getEutl()
                        .isAcceptTransitional();
        if (acceptTransitional && STATUS_SUPERVISION_IN_CESSATION.equals(statusUri)) return true;
        return false;
    }

    /** Create secure DocumentBuilderFactory with namespace awareness. */
    private DocumentBuilderFactory secureDbfWithNamespaces() throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        // Secure processing hardening
        factory.setFeature(javax.xml.XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        return factory;
    }

    /** Get first child element with given local name in TSL namespace. */
    private org.w3c.dom.Element firstChildNS(org.w3c.dom.Element parent, String localName) {
        NodeList nl = parent.getElementsByTagNameNS(NS_TSL, localName);
        return (nl.getLength() == 0) ? null : (org.w3c.dom.Element) nl.item(0);
    }

    /** Get text content of first child with given local name. */
    private String textOf(org.w3c.dom.Element parent, String localName) {
        org.w3c.dom.Element e = firstChildNS(parent, localName);
        return (e == null) ? "" : e.getTextContent().trim();
    }

    /** Get signing trust store */
    public KeyStore getSigningTrustStore() {
        return signingTrustAnchors;
    }
}
