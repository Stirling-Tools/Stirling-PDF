package stirling.software.common.model;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.Data;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.configuration.YamlPropertySourceFactory;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.common.model.oauth2.GitHubProvider;
import stirling.software.common.model.oauth2.GoogleProvider;
import stirling.software.common.model.oauth2.KeycloakProvider;
import stirling.software.common.model.oauth2.Provider;
import stirling.software.common.service.SsrfProtectionService.SsrfProtectionLevel;
import stirling.software.common.util.ValidationUtils;

@Data
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConfigurationProperties(prefix = "")
public class ApplicationProperties {

    private Legal legal = new Legal();
    private Security security = new Security();
    private System system = new System();
    private Ui ui = new Ui();
    private Endpoints endpoints = new Endpoints();
    private Metrics metrics = new Metrics();
    private AutomaticallyGenerated automaticallyGenerated = new AutomaticallyGenerated();

    private Mail mail = new Mail();

    private Premium premium = new Premium();

    @JsonIgnore // Deprecated - completely hidden from JSON serialization
    private EnterpriseEdition enterpriseEdition = new EnterpriseEdition();

    private AutoPipeline autoPipeline = new AutoPipeline();
    private ProcessExecutor processExecutor = new ProcessExecutor();

    @Bean
    public PropertySource<?> dynamicYamlPropertySource(ConfigurableEnvironment environment)
            throws IOException {
        String configPath = InstallationPathConfig.getSettingsPath();
        log.debug("Attempting to load settings from: {}", configPath);

        File file = new File(configPath);
        if (!file.exists()) {
            log.error("Warning: Settings file does not exist at: {}", configPath);
        }

        Resource resource = new FileSystemResource(configPath);
        if (!resource.exists()) {
            throw new FileNotFoundException("Settings file not found at: " + configPath);
        }

        EncodedResource encodedResource = new EncodedResource(resource);
        PropertySource<?> propertySource =
                new YamlPropertySourceFactory().createPropertySource(null, encodedResource);
        environment.getPropertySources().addFirst(propertySource);

        log.debug("Loaded properties: {}", propertySource.getSource());

        return propertySource;
    }

    @Data
    public static class AutoPipeline {
        private String outputFolder;
    }

    @Data
    public static class Legal {
        private String termsAndConditions;
        private String privacyPolicy;
        private String accessibilityStatement;
        private String cookiePolicy;
        private String impressum;
    }

    @Data
    public static class Security {
        private Boolean enableLogin;
        private Boolean csrfDisabled;
        private InitialLogin initialLogin = new InitialLogin();
        private OAUTH2 oauth2 = new OAUTH2();
        private SAML2 saml2 = new SAML2();
        private int loginAttemptCount;
        private long loginResetTimeMinutes;
        private String loginMethod = "all";
        private String customGlobalAPIKey;
        private Jwt jwt = new Jwt();

        public Boolean isAltLogin() {
            return saml2.getEnabled() || oauth2.getEnabled();
        }

        public enum LoginMethods {
            ALL("all"),
            NORMAL("normal"),
            OAUTH2("oauth2"),
            SAML2("saml2");

            private String method;

            LoginMethods(String method) {
                this.method = method;
            }

            @Override
            public String toString() {
                return method;
            }
        }

        public boolean isUserPass() {
            return (loginMethod.equalsIgnoreCase(LoginMethods.NORMAL.toString())
                    || loginMethod.equalsIgnoreCase(LoginMethods.ALL.toString()));
        }

        public boolean isOauth2Active() {
            return (oauth2 != null
                    && oauth2.getEnabled()
                    && !loginMethod.equalsIgnoreCase(LoginMethods.NORMAL.toString()));
        }

        public boolean isSaml2Active() {
            return (saml2 != null
                    && saml2.getEnabled()
                    && !loginMethod.equalsIgnoreCase(LoginMethods.NORMAL.toString()));
        }

        @Data
        public static class InitialLogin {
            private String username;
            @ToString.Exclude private String password;
        }

        @Getter
        @Setter
        @ToString
        public static class SAML2 {
            private String provider;
            private Boolean enabled = false;
            private Boolean autoCreateUser = false;
            private Boolean blockRegistration = false;
            private String registrationId = "stirling";

            @ToString.Exclude
            @JsonProperty("idpMetadataUri")
            private String idpMetadataUri;

            private String idpSingleLogoutUrl;
            private String idpSingleLoginUrl;
            private String idpIssuer;

            @JsonProperty("idpCert")
            private String idpCert;

            @ToString.Exclude
            @JsonProperty("privateKey")
            private String privateKey;

            @ToString.Exclude
            @JsonProperty("spCert")
            private String spCert;

            @JsonIgnore
            public InputStream getIdpMetadataUri() throws IOException {
                if (idpMetadataUri.startsWith("classpath:")) {
                    return new ClassPathResource(idpMetadataUri.substring("classpath:".length()))
                            .getInputStream();
                }
                try {
                    URI uri = new URI(idpMetadataUri);
                    URL url = uri.toURL();
                    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                    connection.setRequestMethod("GET");
                    return connection.getInputStream();
                } catch (URISyntaxException e) {
                    throw new IOException("Invalid URI format: " + idpMetadataUri, e);
                }
            }

            @JsonIgnore
            public Resource getSpCert() {
                if (spCert == null) return null;
                if (spCert.startsWith("classpath:")) {
                    return new ClassPathResource(spCert.substring("classpath:".length()));
                } else {
                    return new FileSystemResource(spCert);
                }
            }

            @JsonIgnore
            public Resource getIdpCert() {
                if (idpCert == null) return null;
                if (idpCert.startsWith("classpath:")) {
                    return new ClassPathResource(idpCert.substring("classpath:".length()));
                } else {
                    return new FileSystemResource(idpCert);
                }
            }

            @JsonIgnore
            public Resource getPrivateKey() {
                if (privateKey == null) return null;
                if (privateKey.startsWith("classpath:")) {
                    return new ClassPathResource(privateKey.substring("classpath:".length()));
                } else {
                    return new FileSystemResource(privateKey);
                }
            }
        }

        @Data
        public static class OAUTH2 {
            private Boolean enabled = false;
            private String issuer;
            private String clientId;
            @ToString.Exclude private String clientSecret;
            private Boolean autoCreateUser = false;
            private Boolean blockRegistration = false;
            private String useAsUsername;
            private Collection<String> scopes = new ArrayList<>();
            private String provider;
            private Client client = new Client();

            public void setScopes(String scopes) {
                List<String> scopesList =
                        Arrays.stream(scopes.split(",")).map(String::trim).toList();
                this.scopes.addAll(scopesList);
            }

            protected boolean isValid(String value, String name) {
                return value != null && !value.trim().isEmpty();
            }

            protected boolean isValid(Collection<String> value, String name) {
                return value != null && !value.isEmpty();
            }

            public boolean isSettingsValid() {
                return !ValidationUtils.isStringEmpty(this.getIssuer())
                        && !ValidationUtils.isStringEmpty(this.getClientId())
                        && !ValidationUtils.isStringEmpty(this.getClientSecret())
                        && !ValidationUtils.isCollectionEmpty(this.getScopes())
                        && !ValidationUtils.isStringEmpty(this.getUseAsUsername());
            }

            @Data
            public static class Client {
                private GoogleProvider google = new GoogleProvider();
                private GitHubProvider github = new GitHubProvider();
                private KeycloakProvider keycloak = new KeycloakProvider();

                public Provider get(String registrationId) throws UnsupportedProviderException {
                    return switch (registrationId.toLowerCase()) {
                        case "google" -> getGoogle();
                        case "github" -> getGithub();
                        case "keycloak" -> getKeycloak();
                        default ->
                                throw new UnsupportedProviderException(
                                        "Logout from the provider "
                                                + registrationId
                                                + " is not supported. "
                                                + "Report it at https://github.com/Stirling-Tools/Stirling-PDF/issues");
                    };
                }
            }
        }

        @Data
        public static class Jwt {
            private boolean enabled = true;
            private boolean keyCleanup = true;
            private int keyRetentionDays = 7;
            private Boolean secureCookie;
        }
    }

    @Data
    public static class System {
        private String defaultLocale;
        private Boolean googlevisibility;
        private boolean showUpdate;
        private Boolean showUpdateOnlyAdmin;
        private boolean customHTMLFiles;
        private String tessdataDir;
        private Boolean enableAlphaFunctionality;
        private Boolean enableAnalytics;
        private Datasource datasource;
        private Boolean disableSanitize;
        private int maxDPI;
        private Boolean enableUrlToPDF;
        private Html html = new Html();
        private CustomPaths customPaths = new CustomPaths();
        private String fileUploadLimit;
        private TempFileManagement tempFileManagement = new TempFileManagement();
        private DatabaseBackup databaseBackup = new DatabaseBackup();

        public boolean isAnalyticsEnabled() {
            return this.getEnableAnalytics() != null && this.getEnableAnalytics();
        }
    }

    @Data
    public static class DatabaseBackup {
        private String cron = "0 0 0 * * ?"; // daily at midnight
    }

    @Data
    public static class CustomPaths {
        private Pipeline pipeline = new Pipeline();
        private Operations operations = new Operations();

        @Data
        public static class Pipeline {
            private String watchedFoldersDir;
            private String finishedFoldersDir;
            private String webUIConfigsDir;
        }

        @Data
        public static class Operations {
            private String weasyprint;
            private String unoconvert;
        }
    }

    @Data
    public static class TempFileManagement {
        @JsonProperty("baseTmpDir")
        private String baseTmpDir = "";

        @JsonProperty("libreofficeDir")
        private String libreofficeDir = "";

        private String systemTempDir = "";
        private String prefix = "stirling-pdf-";
        private long maxAgeHours = 24;
        private long cleanupIntervalMinutes = 30;
        private boolean startupCleanup = true;
        private boolean cleanupSystemTemp = false;

        @JsonIgnore
        public String getBaseTmpDir() {
            if (baseTmpDir != null && !baseTmpDir.isEmpty()) {
                return baseTmpDir;
            }
            String tmp = java.lang.System.getProperty("java.io.tmpdir");
            return new File(tmp, "stirling-pdf").getPath();
        }

        @JsonIgnore
        public String getLibreofficeDir() {
            if (libreofficeDir != null && !libreofficeDir.isEmpty()) {
                return libreofficeDir;
            }
            return new File(getBaseTmpDir(), "libreoffice").getPath();
        }
    }

    @Data
    public static class Html {
        private UrlSecurity urlSecurity = new UrlSecurity();

        @Data
        public static class UrlSecurity {
            private boolean enabled = true;
            private SsrfProtectionLevel level = SsrfProtectionLevel.MEDIUM; // MAX, MEDIUM, OFF
            private List<String> allowedDomains = new ArrayList<>();
            private List<String> blockedDomains = new ArrayList<>();
            private List<String> internalTlds =
                    Arrays.asList(".local", ".internal", ".corp", ".home");
            private boolean blockPrivateNetworks = true;
            private boolean blockLocalhost = true;
            private boolean blockLinkLocal = true;
            private boolean blockCloudMetadata = true;
        }
    }

    @Data
    public static class Datasource {
        private boolean enableCustomDatabase;
        private String customDatabaseUrl;
        private String type;
        private String hostName;
        private Integer port;
        private String name;
        private String username;
        @ToString.Exclude private String password;
    }

    public enum Driver {
        H2("h2"),
        POSTGRESQL("postgresql"),
        ORACLE("oracle"),
        MYSQL("mysql");

        private final String driverName;

        Driver(String driverName) {
            this.driverName = driverName;
        }

        @Override
        public String toString() {
            return """
                Driver {
                  driverName='%s'
                }
                """
                    .formatted(driverName);
        }
    }

    @Data
    public static class Ui {
        private String appName;
        private String homeDescription;
        private String appNameNavbar;
        private List<String> languages;

        public String getAppName() {
            return appName != null && !appName.trim().isEmpty() ? appName : null;
        }

        public String getHomeDescription() {
            return homeDescription != null && !homeDescription.trim().isEmpty()
                    ? homeDescription
                    : null;
        }

        public String getAppNameNavbar() {
            return appNameNavbar != null && !appNameNavbar.trim().isEmpty() ? appNameNavbar : null;
        }
    }

    @Data
    public static class Endpoints {
        private List<String> toRemove;
        private List<String> groupsToRemove;
    }

    @Data
    public static class Metrics {
        private Boolean enabled;
    }

    @Data
    public static class AutomaticallyGenerated {
        @ToString.Exclude private String key;
        private String UUID;
        private String appVersion;
    }

    // TODO: Remove post migration
    @Data
    @Deprecated(since = "0.45.0")
    public static class EnterpriseEdition {
        private boolean enabled;
        @ToString.Exclude private String key;
        private int maxUsers;
        private boolean ssoAutoLogin;
        private CustomMetadata customMetadata = new CustomMetadata();

        @Data
        public static class CustomMetadata {
            private boolean autoUpdateMetadata;
            private String author;
            private String creator;
            private String producer;

            public String getCreator() {
                return creator == null || creator.trim().isEmpty() ? "Stirling-PDF" : creator;
            }

            public String getProducer() {
                return producer == null || producer.trim().isEmpty() ? "Stirling-PDF" : producer;
            }
        }
    }

    @Data
    public static class Mail {
        private boolean enabled;
        private String host;
        private int port;
        private String username;
        @ToString.Exclude private String password;
        private String from;
    }

    @Data
    public static class Premium {
        private boolean enabled;
        @ToString.Exclude private String key;
        private int maxUsers;
        private ProFeatures proFeatures = new ProFeatures();
        private EnterpriseFeatures enterpriseFeatures = new EnterpriseFeatures();

        @Data
        public static class ProFeatures {
            private boolean ssoAutoLogin;
            private boolean database;
            private CustomMetadata customMetadata = new CustomMetadata();
            private GoogleDrive googleDrive = new GoogleDrive();

            @Data
            public static class CustomMetadata {
                private boolean autoUpdateMetadata;
                private String author;
                private String creator;
                private String producer;

                public String getCreator() {
                    return creator == null || creator.trim().isEmpty() ? "Stirling-PDF" : creator;
                }

                public String getProducer() {
                    return producer == null || producer.trim().isEmpty()
                            ? "Stirling-PDF"
                            : producer;
                }
            }

            @Data
            public static class GoogleDrive {
                private boolean enabled;
                private String clientId;
                private String apiKey;
                private String appId;

                public String getClientId() {
                    return clientId == null || clientId.trim().isEmpty() ? "" : clientId;
                }

                public String getApiKey() {
                    return apiKey == null || apiKey.trim().isEmpty() ? "" : apiKey;
                }

                public String getAppId() {
                    return appId == null || appId.trim().isEmpty() ? "" : appId;
                }
            }
        }

        @Data
        public static class EnterpriseFeatures {
            private PersistentMetrics persistentMetrics = new PersistentMetrics();
            private Audit audit = new Audit();

            @Data
            public static class Audit {
                private boolean enabled = true;
                private int level = 2; // 0=OFF, 1=BASIC, 2=STANDARD, 3=VERBOSE
                private int retentionDays = 90;
            }

            @Data
            public static class PersistentMetrics {
                private boolean enabled;
                private int retentionDays;
            }
        }
    }

    @Data
    public static class ProcessExecutor {
        private SessionLimit sessionLimit = new SessionLimit();
        private TimeoutMinutes timeoutMinutes = new TimeoutMinutes();

        @Data
        public static class SessionLimit {
            private int libreOfficeSessionLimit;
            private int pdfToHtmlSessionLimit;
            private int pythonOpenCvSessionLimit;
            private int weasyPrintSessionLimit;
            private int installAppSessionLimit;
            private int calibreSessionLimit;
            private int qpdfSessionLimit;
            private int tesseractSessionLimit;
            private int ghostscriptSessionLimit;
            private int ocrMyPdfSessionLimit;
            private int pdfOutlinerSessionLimit;

            public int getQpdfSessionLimit() {
                return qpdfSessionLimit > 0 ? qpdfSessionLimit : 2;
            }

            public int getTesseractSessionLimit() {
                return tesseractSessionLimit > 0 ? tesseractSessionLimit : 1;
            }

            public int getLibreOfficeSessionLimit() {
                return libreOfficeSessionLimit > 0 ? libreOfficeSessionLimit : 1;
            }

            public int getPdfToHtmlSessionLimit() {
                return pdfToHtmlSessionLimit > 0 ? pdfToHtmlSessionLimit : 1;
            }

            public int getPythonOpenCvSessionLimit() {
                return pythonOpenCvSessionLimit > 0 ? pythonOpenCvSessionLimit : 8;
            }

            public int getWeasyPrintSessionLimit() {
                return weasyPrintSessionLimit > 0 ? weasyPrintSessionLimit : 16;
            }

            public int getInstallAppSessionLimit() {
                return installAppSessionLimit > 0 ? installAppSessionLimit : 1;
            }

            public int getCalibreSessionLimit() {
                return calibreSessionLimit > 0 ? calibreSessionLimit : 1;
            }

            public int getGhostscriptSessionLimit() {
                return ghostscriptSessionLimit > 0 ? ghostscriptSessionLimit : 8;
            }

            public int getOcrMyPdfSessionLimit() {
                return ocrMyPdfSessionLimit > 0 ? ocrMyPdfSessionLimit : 2;
            }

            public int getPdfOutlinerSessionLimit() {
                return pdfOutlinerSessionLimit > 0 ? pdfOutlinerSessionLimit : 1;
            }
        }

        @Data
        public static class TimeoutMinutes {
            @JsonProperty("libreOfficetimeoutMinutes")
            private long libreOfficeTimeoutMinutes;

            @JsonProperty("pdfToHtmltimeoutMinutes")
            private long pdfToHtmlTimeoutMinutes;

            @JsonProperty("pythonOpenCvtimeoutMinutes")
            private long pythonOpenCvTimeoutMinutes;

            @JsonProperty("weasyPrinttimeoutMinutes")
            private long weasyPrintTimeoutMinutes;

            @JsonProperty("installApptimeoutMinutes")
            private long installAppTimeoutMinutes;

            @JsonProperty("calibretimeoutMinutes")
            private long calibreTimeoutMinutes;

            private long tesseractTimeoutMinutes;
            private long qpdfTimeoutMinutes;
            private long ghostscriptTimeoutMinutes;
            private long ocrMyPdfTimeoutMinutes;
            private long pdfOutlinerTimeoutMinutes;

            public long getTesseractTimeoutMinutes() {
                return tesseractTimeoutMinutes > 0 ? tesseractTimeoutMinutes : 30;
            }

            public long getQpdfTimeoutMinutes() {
                return qpdfTimeoutMinutes > 0 ? qpdfTimeoutMinutes : 30;
            }

            public long getLibreOfficeTimeoutMinutes() {
                return libreOfficeTimeoutMinutes > 0 ? libreOfficeTimeoutMinutes : 30;
            }

            public long getPdfToHtmlTimeoutMinutes() {
                return pdfToHtmlTimeoutMinutes > 0 ? pdfToHtmlTimeoutMinutes : 20;
            }

            public long getPythonOpenCvTimeoutMinutes() {
                return pythonOpenCvTimeoutMinutes > 0 ? pythonOpenCvTimeoutMinutes : 30;
            }

            public long getWeasyPrintTimeoutMinutes() {
                return weasyPrintTimeoutMinutes > 0 ? weasyPrintTimeoutMinutes : 30;
            }

            public long getInstallAppTimeoutMinutes() {
                return installAppTimeoutMinutes > 0 ? installAppTimeoutMinutes : 60;
            }

            public long getCalibreTimeoutMinutes() {
                return calibreTimeoutMinutes > 0 ? calibreTimeoutMinutes : 30;
            }

            public long getGhostscriptTimeoutMinutes() {
                return ghostscriptTimeoutMinutes > 0 ? ghostscriptTimeoutMinutes : 30;
            }

            public long getOcrMyPdfTimeoutMinutes() {
                return ocrMyPdfTimeoutMinutes > 0 ? ocrMyPdfTimeoutMinutes : 30;
            }

            public long getPdfOutlinerTimeoutMinutes() {
                return pdfOutlinerTimeoutMinutes > 0 ? pdfOutlinerTimeoutMinutes : 30;
            }
        }
    }
}
