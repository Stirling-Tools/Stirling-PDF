package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.Provider;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Stream;

import org.bouncycastle.asn1.x500.RDN;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.asn1.x500.style.IETFUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.Dependency;
import stirling.software.SPDF.model.SignatureFile;
import stirling.software.SPDF.model.api.security.CertStoreEntriesRequest;
import stirling.software.SPDF.service.SharedSignatureService;
import stirling.software.SPDF.util.DesktopModeUtils;
import stirling.software.SPDF.util.Pkcs11ProviderLoader;
import stirling.software.common.annotations.api.UiDataApi;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;

@Slf4j
@UiDataApi
public class UIDataController {

    private final ApplicationProperties applicationProperties;
    private final SharedSignatureService signatureService;
    private final UserServiceInterface userService;
    private final ResourceLoader resourceLoader;
    private final RuntimePathConfig runtimePathConfig;

    public UIDataController(
            ApplicationProperties applicationProperties,
            SharedSignatureService signatureService,
            @Autowired(required = false) UserServiceInterface userService,
            ResourceLoader resourceLoader,
            RuntimePathConfig runtimePathConfig) {
        this.applicationProperties = applicationProperties;
        this.signatureService = signatureService;
        this.userService = userService;
        this.resourceLoader = resourceLoader;
        this.runtimePathConfig = runtimePathConfig;
    }

    @GetMapping("/footer-info")
    @Operation(summary = "Get public footer configuration data")
    public ResponseEntity<FooterData> getFooterData() {
        FooterData data = new FooterData();
        data.setAnalyticsEnabled(applicationProperties.getSystem().getEnableAnalytics());
        data.setTermsAndConditions(applicationProperties.getLegal().getTermsAndConditions());
        data.setPrivacyPolicy(applicationProperties.getLegal().getPrivacyPolicy());
        data.setAccessibilityStatement(
                applicationProperties.getLegal().getAccessibilityStatement());
        data.setCookiePolicy(applicationProperties.getLegal().getCookiePolicy());
        data.setImpressum(applicationProperties.getLegal().getImpressum());

        return ResponseEntity.ok(data);
    }

    @GetMapping("/home")
    @Operation(summary = "Get home page data")
    public ResponseEntity<HomeData> getHomeData() {
        String showSurvey = System.getenv("SHOW_SURVEY");
        boolean showSurveyValue = showSurvey == null || "true".equalsIgnoreCase(showSurvey);

        HomeData data = new HomeData();
        data.setShowSurveyFromDocker(showSurveyValue);

        return ResponseEntity.ok(data);
    }

    @GetMapping("/licenses")
    @Operation(summary = "Get third-party licenses data")
    public ResponseEntity<LicensesData> getLicensesData() {
        LicensesData data = new LicensesData();
        Resource resource = new ClassPathResource("static/3rdPartyLicenses.json");

        try (InputStream is = resource.getInputStream()) {
            String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            ObjectMapper mapper = new ObjectMapper();
            Map<String, List<Dependency>> licenseData =
                    mapper.readValue(json, new TypeReference<>() {});
            data.setDependencies(licenseData.get("dependencies"));
        } catch (IOException e) {
            log.error("Failed to load licenses data", e);
            data.setDependencies(Collections.emptyList());
        }

        return ResponseEntity.ok(data);
    }

    @GetMapping("/pipeline")
    @Operation(summary = "Get pipeline configuration data")
    public ResponseEntity<PipelineData> getPipelineData() {
        PipelineData data = new PipelineData();
        List<String> pipelineConfigs = new ArrayList<>();
        List<Map<String, String>> pipelineConfigsWithNames = new ArrayList<>();

        if (new java.io.File(runtimePathConfig.getPipelineDefaultWebUiConfigs()).exists()) {
            try (Stream<Path> paths =
                    Files.walk(Paths.get(runtimePathConfig.getPipelineDefaultWebUiConfigs()))) {
                List<Path> jsonFiles =
                        paths.filter(Files::isRegularFile)
                                .filter(p -> p.toString().endsWith(".json"))
                                .toList();

                for (Path jsonFile : jsonFiles) {
                    String content = Files.readString(jsonFile, StandardCharsets.UTF_8);
                    pipelineConfigs.add(content);
                }

                for (String config : pipelineConfigs) {
                    Map<String, Object> jsonContent =
                            new ObjectMapper()
                                    .readValue(config, new TypeReference<Map<String, Object>>() {});
                    String name = (String) jsonContent.get("name");
                    if (name == null || name.length() < 1) {
                        String filename =
                                jsonFiles
                                        .get(pipelineConfigs.indexOf(config))
                                        .getFileName()
                                        .toString();
                        name = filename.substring(0, filename.lastIndexOf('.'));
                    }
                    Map<String, String> configWithName = new HashMap<>();
                    configWithName.put("json", config);
                    configWithName.put("name", name);
                    pipelineConfigsWithNames.add(configWithName);
                }
            } catch (IOException e) {
                log.error("Failed to load pipeline configs", e);
            }
        }

        if (pipelineConfigsWithNames.isEmpty()) {
            Map<String, String> configWithName = new HashMap<>();
            configWithName.put("json", "");
            configWithName.put("name", "No preloaded configs found");
            pipelineConfigsWithNames.add(configWithName);
        }

        data.setPipelineConfigsWithNames(pipelineConfigsWithNames);
        data.setPipelineConfigs(pipelineConfigs);

        return ResponseEntity.ok(data);
    }

    @GetMapping("/sign")
    @Operation(summary = "Get signature form data")
    public ResponseEntity<SignData> getSignData() {
        String username = "";
        if (userService != null) {
            username = userService.getCurrentUsername();
        }

        List<SignatureFile> signatures = signatureService.getAvailableSignatures(username);
        List<FontResource> fonts = getFontNames();

        SignData data = new SignData();
        data.setSignatures(signatures);
        data.setFonts(fonts);

        return ResponseEntity.ok(data);
    }

    @GetMapping("/ocr-pdf")
    @Operation(summary = "Get OCR PDF data")
    public ResponseEntity<OcrData> getOcrPdfData() {
        List<String> languages = getAvailableTesseractLanguages();

        OcrData data = new OcrData();
        data.setLanguages(languages);

        return ResponseEntity.ok(data);
    }

    @PostMapping(
            value = "/cert-store-entries",
            consumes = {
                MediaType.MULTIPART_FORM_DATA_VALUE,
                MediaType.APPLICATION_FORM_URLENCODED_VALUE
            })
    @Operation(summary = "Get available certificates from OS-backed stores")
    public ResponseEntity<CertificateStoreEntriesData> getCertificateStoreEntries(
            @ModelAttribute CertStoreEntriesRequest request) throws Exception {
        String certType = request.getCertType();
        MultipartFile pkcs11ConfigFile = request.getPkcs11ConfigFile();
        String password = request.getPassword();

        if (certType == null || certType.isBlank()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.optionsNotSpecified",
                    "{0} options are not specified",
                    "certificate store type");
        }

        ensureDesktopMode(certType);

        KeyStore keyStore = loadCertificateStore(certType, pkcs11ConfigFile, password);
        List<CertificateStoreEntry> entries = new ArrayList<>();
        Enumeration<String> aliases = keyStore.aliases();
        while (aliases.hasMoreElements()) {
            String alias = aliases.nextElement();
            if (!keyStore.isKeyEntry(alias)) {
                continue;
            }
            Certificate certificate = keyStore.getCertificate(alias);
            if (certificate instanceof X509Certificate x509Certificate) {
                entries.add(buildCertificateEntry(alias, x509Certificate));
            }
        }
        entries.sort(
                Comparator.comparing(
                        CertificateStoreEntry::getDisplayName, String::compareToIgnoreCase));

        CertificateStoreEntriesData data = new CertificateStoreEntriesData();
        data.setEntries(entries);
        return ResponseEntity.ok(data);
    }

    private List<String> getAvailableTesseractLanguages() {
        String tessdataDir = applicationProperties.getSystem().getTessdataDir();
        java.io.File[] files = new java.io.File(tessdataDir).listFiles();
        if (files == null) {
            return Collections.emptyList();
        }
        return Arrays.stream(files)
                .filter(file -> file.getName().endsWith(".traineddata"))
                .map(file -> file.getName().replace(".traineddata", ""))
                .filter(lang -> !"osd".equalsIgnoreCase(lang))
                .sorted()
                .toList();
    }

    private void ensureDesktopMode(String certType) {
        if (!DesktopModeUtils.isDesktopMode()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid argument: {0}",
                    "certificate type " + certType + " requires desktop mode");
        }
    }

    private KeyStore loadCertificateStore(
            String certType, MultipartFile pkcs11ConfigFile, String password)
            throws KeyStoreException, IOException, NoSuchAlgorithmException, CertificateException {
        switch (certType) {
            case "WINDOWS_STORE":
                KeyStore windowsStore = KeyStore.getInstance("Windows-MY");
                windowsStore.load(null, null);
                return windowsStore;
            case "MAC_KEYCHAIN":
                KeyStore keychainStore = KeyStore.getInstance("KeychainStore");
                keychainStore.load(null, null);
                return keychainStore;
            case "PKCS11":
                if (pkcs11ConfigFile == null || pkcs11ConfigFile.isEmpty()) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.invalidArgument",
                            "Invalid argument: {0}",
                            "PKCS11 configuration file is required");
                }
                Provider pkcs11Provider = Pkcs11ProviderLoader.loadProvider(pkcs11ConfigFile);
                KeyStore pkcs11Store = KeyStore.getInstance("PKCS11", pkcs11Provider);
                pkcs11Store.load(null, password != null ? password.toCharArray() : null);
                return pkcs11Store;
            default:
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidArgument",
                        "Invalid argument: {0}",
                        "certificate store type: " + certType);
        }
    }

    private CertificateStoreEntry buildCertificateEntry(String alias, X509Certificate certificate) {
        String displayName = getCertificateDisplayName(certificate);
        return new CertificateStoreEntry(
                alias,
                displayName,
                certificate.getSubjectX500Principal().getName(),
                certificate.getIssuerX500Principal().getName(),
                certificate.getSerialNumber().toString(),
                formatDate(certificate.getNotBefore()),
                formatDate(certificate.getNotAfter()),
                certificate.getNotBefore().getTime(),
                certificate.getNotAfter().getTime());
    }

    private String getCertificateDisplayName(X509Certificate certificate) {
        X500Name x500Name = new X500Name(certificate.getSubjectX500Principal().getName());
        RDN[] cnRdns = x500Name.getRDNs(BCStyle.CN);
        if (cnRdns != null && cnRdns.length > 0 && cnRdns[0].getFirst() != null) {
            return IETFUtils.valueToString(cnRdns[0].getFirst().getValue());
        }
        return certificate.getSubjectX500Principal().getName();
    }

    private String formatDate(Date date) {
        return DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
                Instant.ofEpochMilli(date.getTime()).atOffset(ZoneOffset.UTC));
    }

    private List<FontResource> getFontNames() {
        List<FontResource> fontNames = new ArrayList<>();
        fontNames.addAll(getFontNamesFromLocation("classpath:static/fonts/*.woff2"));
        fontNames.addAll(
                getFontNamesFromLocation(
                        "file:"
                                + InstallationPathConfig.getStaticPath()
                                + "fonts"
                                + java.io.File.separator
                                + "*"));
        return fontNames;
    }

    private List<FontResource> getFontNamesFromLocation(String locationPattern) {
        try {
            Resource[] resources =
                    GeneralUtils.getResourcesFromLocationPattern(locationPattern, resourceLoader);
            return Arrays.stream(resources)
                    .map(
                            resource -> {
                                try {
                                    String filename = resource.getFilename();
                                    if (filename != null) {
                                        int lastDotIndex = filename.lastIndexOf('.');
                                        if (lastDotIndex != -1) {
                                            String name = filename.substring(0, lastDotIndex);
                                            String extension = filename.substring(lastDotIndex + 1);
                                            return new FontResource(name, extension);
                                        }
                                    }
                                    return null;
                                } catch (Exception e) {
                                    throw ExceptionUtils.createRuntimeException(
                                            "error.fontLoadingFailed",
                                            "Error processing font file",
                                            e);
                                }
                            })
                    .filter(Objects::nonNull)
                    .toList();
        } catch (Exception e) {
            throw ExceptionUtils.createRuntimeException(
                    "error.fontDirectoryReadFailed", "Failed to read font directory", e);
        }
    }

    // Data classes
    @Data
    public static class FooterData {
        private Boolean analyticsEnabled;
        private String termsAndConditions;
        private String privacyPolicy;
        private String accessibilityStatement;
        private String cookiePolicy;
        private String impressum;
    }

    @Data
    public static class HomeData {
        private boolean showSurveyFromDocker;
    }

    @Data
    public static class LicensesData {
        private List<Dependency> dependencies;
    }

    @Data
    public static class PipelineData {
        private List<Map<String, String>> pipelineConfigsWithNames;
        private List<String> pipelineConfigs;
    }

    @Data
    public static class SignData {
        private List<SignatureFile> signatures;
        private List<FontResource> fonts;
    }

    @Data
    public static class OcrData {
        private List<String> languages;
    }

    @Data
    public static class CertificateStoreEntriesData {
        private List<CertificateStoreEntry> entries;
    }

    @Data
    public static class CertificateStoreEntry {
        private final String alias;
        private final String displayName;
        private final String subject;
        private final String issuer;
        private final String serialNumber;
        private final String notBefore;
        private final String notAfter;
        private final long notBeforeEpochMs;
        private final long notAfterEpochMs;
    }

    @Data
    public static class FontResource {
        private String name;
        private String extension;
        private String type;

        public FontResource(String name, String extension) {
            this.name = name;
            this.extension = extension;
            this.type = getFormatFromExtension(extension);
        }

        private static String getFormatFromExtension(String extension) {
            switch (extension) {
                case "ttf":
                    return "truetype";
                case "woff":
                    return "woff";
                case "woff2":
                    return "woff2";
                case "eot":
                    return "embedded-opentype";
                case "svg":
                    return "svg";
                default:
                    return "";
            }
        }
    }
}
