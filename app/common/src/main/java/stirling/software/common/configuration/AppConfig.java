package stirling.software.common.configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.function.Predicate;
import java.util.stream.Stream;

import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.quarkus.arc.DefaultBean;
import io.quarkus.arc.profile.UnlessBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.Dependent;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import jakarta.inject.Named;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * Central CDI producer hub (migrated from a Spring {@code @Configuration} class).
 *
 * <p>MIGRATION NOTES (Spring -> Quarkus CDI):
 *
 * <ul>
 *   <li>{@code @Bean} -> {@code @Produces}; {@code @Bean(name="x")} ->
 *       {@code @Produces @Named("x")}.
 *   <li>{@code @Value} -> {@code @ConfigProperty}; Spring {@code Environment} -> MicroProfile
 *       {@code Config}.
 *   <li>{@code @Profile("default")} flavor-default beans -> {@code @DefaultBean}: the :proprietary
 *       / :saas modules provide the "real" producer and automatically win when present, exactly
 *       like the old profile override (this is the Quarkus idiom for "default unless overridden").
 *   <li>{@code @Scope("request")} on {@code boolean} producers -> {@code @Dependent}. CDI normal
 *       scopes (e.g. {@code @RequestScoped}) require a client proxy, which is impossible for
 *       primitives/finals, so Spring's request-scoped primitive beans cannot be reproduced
 *       directly. {@code @Dependent} recomputes the value at each injection point, which is the
 *       closest behaviour. TODO: Migration required - if true per-HTTP-request semantics are
 *       needed, wrap the value in a {@code @RequestScoped} holder object instead of producing a
 *       bare boolean.
 *   <li>{@code @Lazy} dropped - CDI beans are initialised lazily by default.
 * </ul>
 */
@Slf4j
@ApplicationScoped
public class AppConfig {

    private final Config config;

    private final ApplicationProperties applicationProperties;

    @Getter
    @ConfigProperty(name = "server.servlet.context-path", defaultValue = "/")
    String contextPath;

    @Getter
    @ConfigProperty(name = "quarkus.http.port", defaultValue = "8080")
    String serverPort;

    @ConfigProperty(name = "v2")
    boolean v2Enabled;

    @Inject
    public AppConfig(Config config, ApplicationProperties applicationProperties) {
        this.config = config;
        this.applicationProperties = applicationProperties;
    }

    /**
     * Get the backend URL from system configuration. Falls back to http://localhost if not
     * configured.
     *
     * @return The backend base URL for SAML/OAuth/API callbacks
     */
    public String getBackendUrl() {
        String backendUrl = applicationProperties.getSystem().getBackendUrl();
        return (backendUrl != null && !backendUrl.isBlank()) ? backendUrl : "http://localhost";
    }

    @Produces
    @Named("v2Enabled")
    public boolean v2Enabled() {
        return v2Enabled;
    }

    // MIGRATION: many beans inject tools.jackson.databind.ObjectMapper (Jackson 3, inherited from
    // Spring Boot 4). Quarkus' container only produces a com.fasterxml.jackson (Jackson 2)
    // ObjectMapper for REST (de)serialization, so the Jackson 3 type is an unsatisfied CDI
    // dependency. This producer supplies a single application-scoped Jackson 3 mapper built the
    // same
    // way the codebase builds them ad hoc (JsonMapper.builder().build()). REST bodies still go
    // through Quarkus' Jackson 2 mapper; this is only for code that uses the Jackson 3 API
    // directly.
    // TODO: Migration required - converge the codebase on one Jackson line (drop Jackson 3) later.
    @Produces
    @ApplicationScoped
    public tools.jackson.databind.ObjectMapper jackson3ObjectMapper() {
        return tools.jackson.databind.json.JsonMapper.builder().build();
    }

    @Produces
    @Named("contextPath")
    public String contextPathBean() {
        return contextPath;
    }

    @Produces
    @Named("loginEnabled")
    public boolean loginEnabled() {
        return applicationProperties.getSecurity().isEnableLogin();
    }

    // MIGRATION: CDI has no producer for the nested ApplicationProperties.Security.SAML2 config
    // object, so beans that inject it directly (e.g. CustomSaml2AuthenticationSuccessHandler) were
    // unsatisfied. Expose it from the already-injected ApplicationProperties. May be null/disabled;
    // that is fine for injection.
    @Produces
    public ApplicationProperties.Security.SAML2 saml2Config() {
        return applicationProperties.getSecurity().getSaml2();
    }

    @Produces
    @Named("appName")
    public String appName() {
        return "Stirling PDF";
    }

    @Produces
    @Named("appVersion")
    public String appVersion() {
        // MIGRATION: Spring ClassPathResource -> plain classloader resource lookup.
        Properties props = new Properties();
        try (var in = getClass().getClassLoader().getResourceAsStream("version.properties")) {
            if (in != null) {
                props.load(in);
                return props.getProperty("version");
            }
        } catch (IOException e) {
            log.error("exception", e);
        }
        return "0.0.0";
    }

    @Produces
    @Named("homeText")
    public String homeText() {
        return "null";
    }

    @Produces
    @Named("languages")
    public List<String> languages() {
        return applicationProperties.getUi().getLanguages();
    }

    @Produces
    @Named("navBarText")
    public String navBarText() {
        String navBar = applicationProperties.getUi().getAppNameNavbar();
        return (navBar != null) ? navBar : "Stirling PDF";
    }

    @Produces
    @Named("enableAlphaFunctionality")
    public boolean enableAlphaFunctionality() {
        return applicationProperties.getSystem().isEnableAlphaFunctionality();
    }

    @Produces
    @Named("rateLimit")
    public boolean rateLimit() {
        String rateLimit = System.getProperty("rateLimit");
        if (rateLimit == null) rateLimit = System.getenv("rateLimit");
        return Boolean.parseBoolean(rateLimit);
    }

    @Produces
    @Named("RunningInDocker")
    public boolean runningInDocker() {
        return Files.exists(Paths.get("/.dockerenv"));
    }

    @Produces
    @Named("configDirMounted")
    public boolean isRunningInDockerWithConfig() {
        Path dockerEnv = Paths.get("/.dockerenv");
        // default to true if not docker
        if (!Files.exists(dockerEnv)) {
            return true;
        }
        Path mountInfo = Paths.get("/proc/1/mountinfo");
        // this should always exist, if not some unknown usecase
        if (!Files.exists(mountInfo)) {
            return true;
        }
        try (Stream<String> lines = Files.lines(mountInfo)) {
            return lines.anyMatch(line -> line.contains(" /configs "));
        } catch (IOException e) {
            return false;
        }
    }

    @Produces
    @Named("activeSecurity")
    public boolean missingActiveSecurity() {
        // MIGRATION: Spring ClassUtils.isPresent -> manual Class.forName presence check.
        try {
            Class.forName(
                    "stirling.software.proprietary.security.configuration.SecurityConfiguration",
                    false,
                    this.getClass().getClassLoader());
            return true;
        } catch (ClassNotFoundException e) {
            return false;
        }
    }

    @Produces
    @Named("directoryFilter")
    public Predicate<Path> processOnlyFiles() {
        return path -> {
            if (Files.isDirectory(path)) {
                return !path.toString().contains("processing");
            } else {
                return true;
            }
        };
    }

    @Produces
    @Named("termsAndConditions")
    public String termsAndConditions() {
        return applicationProperties.getLegal().getTermsAndConditions();
    }

    @Produces
    @Named("privacyPolicy")
    public String privacyPolicy() {
        return applicationProperties.getLegal().getPrivacyPolicy();
    }

    @Produces
    @Named("cookiePolicy")
    public String cookiePolicy() {
        return applicationProperties.getLegal().getCookiePolicy();
    }

    @Produces
    @Named("impressum")
    public String impressum() {
        return applicationProperties.getLegal().getImpressum();
    }

    @Produces
    @Named("accessibilityStatement")
    public String accessibilityStatement() {
        return applicationProperties.getLegal().getAccessibilityStatement();
    }

    @Produces
    @Dependent
    @Named("analyticsPrompt")
    public boolean analyticsPrompt() {
        return applicationProperties.getSystem().getEnableAnalytics() == null;
    }

    @Produces
    @Dependent
    @Named("analyticsEnabled")
    public boolean analyticsEnabled() {
        if (applicationProperties.getPremium().isEnabled()) return true;
        return applicationProperties.getSystem().isAnalyticsEnabled();
    }

    @Produces
    @Named("StirlingPDFLabel")
    public String stirlingPDFLabel() {
        return "Stirling-PDF" + " v" + appVersion();
    }

    @Produces
    @Named("UUID")
    public String uuid() {
        return applicationProperties.getAutomaticallyGenerated().getUUID();
    }

    @Produces
    public ApplicationProperties.Security security() {
        return applicationProperties.getSecurity();
    }

    @Produces
    public ApplicationProperties.Security.OAUTH2 oAuth2() {
        return applicationProperties.getSecurity().getOauth2();
    }

    @Produces
    public ApplicationProperties.Premium premium() {
        return applicationProperties.getPremium();
    }

    @Produces
    public ApplicationProperties.System system() {
        return applicationProperties.getSystem();
    }

    @Produces
    public ApplicationProperties.Datasource datasource() {
        return applicationProperties.getSystem().getDatasource();
    }

    // @UnlessBuildProfile("saas"): in the saas flavor SaasLicenseOverride provides these @Named
    // beans (every tenant is ENTERPRISE). @DefaultBean alone is not enough - Qute's named-bean
    // validation still sees this @DefaultBean producer alongside the saas one and rejects the
    // duplicate @Named key, so this default must be vetoed outright under the saas profile.
    @Produces
    @DefaultBean
    @UnlessBuildProfile("saas")
    @Named("runningProOrHigher")
    public boolean runningProOrHigher() {
        return false;
    }

    @Produces
    @DefaultBean
    @UnlessBuildProfile("saas")
    @Named("runningEE")
    public boolean runningEnterprise() {
        return false;
    }

    @Produces
    @DefaultBean
    @UnlessBuildProfile("saas")
    @Named("license")
    public String licenseType() {
        return "NORMAL";
    }

    @Produces
    @Named("scarfEnabled")
    public boolean scarfEnabled() {
        return applicationProperties.getSystem().isScarfEnabled();
    }

    @Produces
    @Named("posthogEnabled")
    public boolean posthogEnabled() {
        return applicationProperties.getSystem().isPosthogEnabled();
    }

    @Produces
    @Named("machineType")
    public String determineMachineType() {
        try {
            boolean isDocker = runningInDocker();
            boolean isKubernetes = System.getenv("KUBERNETES_SERVICE_HOST") != null;
            boolean isBrowserOpen =
                    "true"
                            .equalsIgnoreCase(
                                    config.getOptionalValue("BROWSER_OPEN", String.class)
                                            .orElse(null));

            if (isKubernetes) {
                return "Kubernetes";
            } else if (isDocker) {
                return "Docker";
            } else if (isBrowserOpen) {
                String os = System.getProperty("os.name").toLowerCase(Locale.ROOT);
                if (os.contains("win")) {
                    return "Client-windows";
                } else if (os.contains("mac")) {
                    return "Client-mac";
                } else {
                    return "Client-unix";
                }
            } else {
                return "Server-jar";
            }
        } catch (Exception e) {
            return "Unknown";
        }
    }
}
