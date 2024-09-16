package stirling.software.SPDF.model;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;

import lombok.Data;
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
    private static final Logger logger = LoggerFactory.getLogger(ApplicationProperties.class);

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
        private int loginAttemptCount;
        private long loginResetTimeMinutes;
        private String loginMethod = "all";

        @Data
        public static class InitialLogin {
            private String username;
            @ToString.Exclude private String password;
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
    }

    @Data
    public static class EnterpriseEdition {
        @ToString.Exclude private String key;
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
}
