package stirling.software.SPDF.model;

import static stirling.software.SPDF.utils.validation.Validator.*;

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
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.EncodedResource;

import lombok.Data;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.InstallationPathConfig;
import stirling.software.SPDF.config.YamlPropertySourceFactory;
import stirling.software.SPDF.model.exception.UnsupportedProviderException;
import stirling.software.SPDF.model.provider.GitHubProvider;
import stirling.software.SPDF.model.provider.GoogleProvider;
import stirling.software.SPDF.model.provider.KeycloakProvider;
import stirling.software.SPDF.model.provider.Provider;

@Configuration
@ConfigurationProperties(prefix = "")
@Data
@Order(Ordered.HIGHEST_PRECEDENCE)
@Slf4j
public class ApplicationProperties {

    @Bean
    public PropertySource<?> dynamicYamlPropertySource(ConfigurableEnvironment environment)
            throws IOException {
        String configPath = InstallationPathConfig.getSettingsPath();
        log.debug("Attempting to load settings from: " + configPath);

        File file = new File(configPath);
        if (!file.exists()) {
            log.error("Warning: Settings file does not exist at: " + configPath);
        }

        Resource resource = new FileSystemResource(configPath);
        if (!resource.exists()) {
            throw new FileNotFoundException("Settings file not found at: " + configPath);
        }

        EncodedResource encodedResource = new EncodedResource(resource);
        PropertySource<?> propertySource =
                new YamlPropertySourceFactory().createPropertySource(null, encodedResource);
        environment.getPropertySources().addFirst(propertySource);

        log.debug("Loaded properties: " + propertySource.getSource());

        return propertySource;
    }

    private Legal legal = new Legal();
    private Security security = new Security();
    private System system = new System();
    private Ui ui = new Ui();
    private Endpoints endpoints = new Endpoints();
    private Metrics metrics = new Metrics();
    private AutomaticallyGenerated automaticallyGenerated = new AutomaticallyGenerated();

    private Mail mail = new Mail();

    private Premium premium = new Premium();
    private EnterpriseEdition enterpriseEdition = new EnterpriseEdition();
    private AutoPipeline autoPipeline = new AutoPipeline();
    private ProcessExecutor processExecutor = new ProcessExecutor();

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
            @ToString.Exclude private String idpMetadataUri;
            private String idpSingleLogoutUrl;
            private String idpSingleLoginUrl;
            private String idpIssuer;
            private String idpCert;
            @ToString.Exclude private String privateKey;
            @ToString.Exclude private String spCert;

            public InputStream getIdpMetadataUri() throws IOException {
                if (idpMetadataUri.startsWith("classpath:")) {
                    return new ClassPathResource(idpMetadataUri.substring("classpath".length()))
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

            public Resource getSpCert() {
                if (spCert == null) return null;
                if (spCert.startsWith("classpath:")) {
                    return new ClassPathResource(spCert.substring("classpath:".length()));
                } else {
                    return new FileSystemResource(spCert);
                }
            }

            public Resource getIdpCert() {
                if (idpCert == null) return null;
                if (idpCert.startsWith("classpath:")) {
                    return new ClassPathResource(idpCert.substring("classpath:".length()));
                } else {
                    return new FileSystemResource(idpCert);
                }
            }

            public Resource getPrivateKey() {
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
                return !isStringEmpty(this.getIssuer())
                        && !isStringEmpty(this.getClientId())
                        && !isStringEmpty(this.getClientSecret())
                        && !isCollectionEmpty(this.getScopes())
                        && !isStringEmpty(this.getUseAsUsername());
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
        private Boolean enableUrlToPDF;
        private CustomPaths customPaths = new CustomPaths();
        private String fileUploadLimit;

        public boolean isAnalyticsEnabled() {
            return this.getEnableAnalytics() != null && this.getEnableAnalytics();
        }
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
            return appName != null && appName.trim().length() > 0 ? appName : null;
        }

        public String getHomeDescription() {
            return homeDescription != null && homeDescription.trim().length() > 0
                    ? homeDescription
                    : null;
        }

        public String getAppNameNavbar() {
            return appNameNavbar != null && appNameNavbar.trim().length() > 0
                    ? appNameNavbar
                    : null;
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
        }

        @Data
        public static class TimeoutMinutes {
            private long libreOfficeTimeoutMinutes;
            private long pdfToHtmlTimeoutMinutes;
            private long pythonOpenCvTimeoutMinutes;
            private long weasyPrintTimeoutMinutes;
            private long installAppTimeoutMinutes;
            private long calibreTimeoutMinutes;
            private long tesseractTimeoutMinutes;
            private long qpdfTimeoutMinutes;

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
        }
    }
}
