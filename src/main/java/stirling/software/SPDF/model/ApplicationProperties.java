package stirling.software.SPDF.model;

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
import java.util.stream.Collectors;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import lombok.Data;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import stirling.software.SPDF.config.YamlPropertySourceFactory;
import stirling.software.SPDF.model.provider.GithubProvider;
import stirling.software.SPDF.model.provider.GoogleProvider;
import stirling.software.SPDF.model.provider.KeycloakProvider;
import stirling.software.SPDF.model.provider.UnsupportedProviderException;

@Configuration
@ConfigurationProperties(prefix = "")
@PropertySource(value = "file:./configs/settings.yml", factory = YamlPropertySourceFactory.class)
@Data
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ApplicationProperties {

    private Legal legal = new Legal();
    private Security security = new Security();
    private System system = new System();
    private Ui ui = new Ui();
    private Endpoints endpoints = new Endpoints();
    private Metrics metrics = new Metrics();
    private AutomaticallyGenerated automaticallyGenerated = new AutomaticallyGenerated();
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

        public boolean isOauth2Activ() {
            return (oauth2 != null
                    && oauth2.getEnabled()
                    && !loginMethod.equalsIgnoreCase(LoginMethods.NORMAL.toString()));
        }

        public boolean isSaml2Activ() {
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
        public static class SAML2 {
            private Boolean enabled = false;
            private Boolean autoCreateUser = false;
            private Boolean blockRegistration = false;
            private String registrationId = "stirling";
            private String idpMetadataUri;
            private String idpSingleLogoutUrl;
            private String idpSingleLoginUrl;
            private String idpIssuer;
            private String idpCert;
            private String privateKey;
            private String spCert;

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
                if (spCert.startsWith("classpath:")) {
                    return new ClassPathResource(spCert.substring("classpath:".length()));
                } else {
                    return new FileSystemResource(spCert);
                }
            }

            public Resource getidpCert() {
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
                        Arrays.stream(scopes.split(","))
                                .map(String::trim)
                                .collect(Collectors.toList());
                this.scopes.addAll(scopesList);
            }

            protected boolean isValid(String value, String name) {
                return value != null && !value.trim().isEmpty();
            }

            protected boolean isValid(Collection<String> value, String name) {
                return value != null && !value.isEmpty();
            }

            public boolean isSettingsValid() {
                return isValid(this.getIssuer(), "issuer")
                        && isValid(this.getClientId(), "clientId")
                        && isValid(this.getClientSecret(), "clientSecret")
                        && isValid(this.getScopes(), "scopes")
                        && isValid(this.getUseAsUsername(), "useAsUsername");
            }

            @Data
            public static class Client {
                private GoogleProvider google = new GoogleProvider();
                private GithubProvider github = new GithubProvider();
                private KeycloakProvider keycloak = new KeycloakProvider();

                public Provider get(String registrationId) throws UnsupportedProviderException {
                    switch (registrationId.toLowerCase()) {
                        case "google":
                            return getGoogle();
                        case "github":
                            return getGithub();
                        case "keycloak":
                            return getKeycloak();
                        default:
                            throw new UnsupportedProviderException(
                                    "Logout from the provider is not supported? Report it at https://github.com/Stirling-Tools/Stirling-PDF/issues");
                    }
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
        private String enableAnalytics;
    }

    @Data
    public static class Ui {
        private String appName;
        private String homeDescription;
        private String appNameNavbar;

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
    }

    @Data
    public static class EnterpriseEdition {
        private boolean enabled;
        @ToString.Exclude private String key;
        private int maxUsers;
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
    public static class ProcessExecutor {
        private SessionLimit sessionLimit = new SessionLimit();
        private TimeoutMinutes timeoutMinutes = new TimeoutMinutes();

        @Data
        public static class SessionLimit {
            private int libreOfficeSessionLimit;
            private int pdfToHtmlSessionLimit;
            private int ocrMyPdfSessionLimit;
            private int pythonOpenCvSessionLimit;
            private int ghostScriptSessionLimit;
            private int weasyPrintSessionLimit;
            private int installAppSessionLimit;
            private int calibreSessionLimit;

            public int getLibreOfficeSessionLimit() {
                return libreOfficeSessionLimit > 0 ? libreOfficeSessionLimit : 1;
            }

            public int getPdfToHtmlSessionLimit() {
                return pdfToHtmlSessionLimit > 0 ? pdfToHtmlSessionLimit : 1;
            }

            public int getOcrMyPdfSessionLimit() {
                return ocrMyPdfSessionLimit > 0 ? ocrMyPdfSessionLimit : 2;
            }

            public int getPythonOpenCvSessionLimit() {
                return pythonOpenCvSessionLimit > 0 ? pythonOpenCvSessionLimit : 8;
            }

            public int getGhostScriptSessionLimit() {
                return ghostScriptSessionLimit > 0 ? ghostScriptSessionLimit : 16;
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
            private long ocrMyPdfTimeoutMinutes;
            private long pythonOpenCvTimeoutMinutes;
            private long ghostScriptTimeoutMinutes;
            private long weasyPrintTimeoutMinutes;
            private long installAppTimeoutMinutes;
            private long calibreTimeoutMinutes;

            public long getLibreOfficeTimeoutMinutes() {
                return libreOfficeTimeoutMinutes > 0 ? libreOfficeTimeoutMinutes : 30;
            }

            public long getPdfToHtmlTimeoutMinutes() {
                return pdfToHtmlTimeoutMinutes > 0 ? pdfToHtmlTimeoutMinutes : 20;
            }

            public long getOcrMyPdfTimeoutMinutes() {
                return ocrMyPdfTimeoutMinutes > 0 ? ocrMyPdfTimeoutMinutes : 30;
            }

            public long getPythonOpenCvTimeoutMinutes() {
                return pythonOpenCvTimeoutMinutes > 0 ? pythonOpenCvTimeoutMinutes : 30;
            }

            public long getGhostScriptTimeoutMinutes() {
                return ghostScriptTimeoutMinutes > 0 ? ghostScriptTimeoutMinutes : 30;
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
