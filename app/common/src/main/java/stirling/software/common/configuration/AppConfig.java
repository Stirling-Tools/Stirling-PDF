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

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Profile;
import org.springframework.context.annotation.Scope;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.util.ClassUtils;
import org.thymeleaf.spring6.SpringTemplateEngine;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Lazy
@Slf4j
@Configuration
@RequiredArgsConstructor
public class AppConfig {

    private final Environment env;

    private final ApplicationProperties applicationProperties;

    @Getter
    @Value("${baseUrl:http://localhost}")
    private String baseUrl;

    @Getter
    @Value("${server.servlet.context-path:/}")
    private String contextPath;

    @Getter
    @Value("${server.port:8080}")
    private String serverPort;

    @Value("${v2}")
    public boolean v2Enabled;

    @Bean
    public boolean v2Enabled() {
        return v2Enabled;
    }

    @Bean
    @ConditionalOnProperty(name = "system.customHTMLFiles", havingValue = "true")
    public SpringTemplateEngine templateEngine(ResourceLoader resourceLoader) {
        SpringTemplateEngine templateEngine = new SpringTemplateEngine();
        templateEngine.addTemplateResolver(new FileFallbackTemplateResolver(resourceLoader));
        return templateEngine;
    }

    @Bean(name = "loginEnabled")
    public boolean loginEnabled() {
        return applicationProperties.getSecurity().getEnableLogin();
    }

    @Bean(name = "appName")
    public String appName() {
        String homeTitle = applicationProperties.getUi().getAppName();
        return (homeTitle != null) ? homeTitle : "Stirling PDF";
    }

    @Bean(name = "appVersion")
    public String appVersion() {
        Resource resource = new ClassPathResource("version.properties");
        Properties props = new Properties();
        try {
            props.load(resource.getInputStream());
            return props.getProperty("version");
        } catch (IOException e) {
            log.error("exception", e);
        }
        return "0.0.0";
    }

    @Bean(name = "homeText")
    public String homeText() {
        return (applicationProperties.getUi().getHomeDescription() != null)
                ? applicationProperties.getUi().getHomeDescription()
                : "null";
    }

    @Bean(name = "languages")
    public List<String> languages() {
        return applicationProperties.getUi().getLanguages();
    }

    @Bean
    public String contextPath(@Value("${server.servlet.context-path}") String contextPath) {
        return contextPath;
    }

    @Bean(name = "navBarText")
    public String navBarText() {
        String defaultNavBar =
                applicationProperties.getUi().getAppNameNavbar() != null
                        ? applicationProperties.getUi().getAppNameNavbar()
                        : applicationProperties.getUi().getAppName();
        return (defaultNavBar != null) ? defaultNavBar : "Stirling PDF";
    }

    @Bean(name = "enableAlphaFunctionality")
    public boolean enableAlphaFunctionality() {
        return applicationProperties.getSystem().getEnableAlphaFunctionality() != null
                ? applicationProperties.getSystem().getEnableAlphaFunctionality()
                : false;
    }

    @Bean(name = "rateLimit")
    public boolean rateLimit() {
        String rateLimit = System.getProperty("rateLimit");
        if (rateLimit == null) rateLimit = System.getenv("rateLimit");
        return Boolean.parseBoolean(rateLimit);
    }

    @Bean(name = "RunningInDocker")
    public boolean runningInDocker() {
        return Files.exists(Paths.get("/.dockerenv"));
    }

    @Bean(name = "configDirMounted")
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

    @Bean(name = "activeSecurity")
    public boolean missingActiveSecurity() {
        return ClassUtils.isPresent(
                "stirling.software.proprietary.security.configuration.SecurityConfiguration",
                this.getClass().getClassLoader());
    }

    @Bean(name = "directoryFilter")
    public Predicate<Path> processOnlyFiles() {
        return path -> {
            if (Files.isDirectory(path)) {
                return !path.toString().contains("processing");
            } else {
                return true;
            }
        };
    }

    @Bean(name = "termsAndConditions")
    public String termsAndConditions() {
        return applicationProperties.getLegal().getTermsAndConditions();
    }

    @Bean(name = "privacyPolicy")
    public String privacyPolicy() {
        return applicationProperties.getLegal().getPrivacyPolicy();
    }

    @Bean(name = "cookiePolicy")
    public String cookiePolicy() {
        return applicationProperties.getLegal().getCookiePolicy();
    }

    @Bean(name = "impressum")
    public String impressum() {
        return applicationProperties.getLegal().getImpressum();
    }

    @Bean(name = "accessibilityStatement")
    public String accessibilityStatement() {
        return applicationProperties.getLegal().getAccessibilityStatement();
    }

    @Bean(name = "analyticsPrompt")
    @Scope("request")
    public boolean analyticsPrompt() {
        return applicationProperties.getSystem().getEnableAnalytics() == null;
    }

    @Bean(name = "analyticsEnabled")
    @Scope("request")
    public boolean analyticsEnabled() {
        if (applicationProperties.getPremium().isEnabled()) return true;
        return applicationProperties.getSystem().isAnalyticsEnabled();
    }

    @Bean(name = "StirlingPDFLabel")
    public String stirlingPDFLabel() {
        return "Stirling-PDF" + " v" + appVersion();
    }

    @Bean(name = "UUID")
    public String uuid() {
        return applicationProperties.getAutomaticallyGenerated().getUUID();
    }

    @Bean
    public ApplicationProperties.Security security() {
        return applicationProperties.getSecurity();
    }

    @Bean
    public ApplicationProperties.Security.OAUTH2 oAuth2() {
        return applicationProperties.getSecurity().getOauth2();
    }

    @Bean
    public ApplicationProperties.Premium premium() {
        return applicationProperties.getPremium();
    }

    @Bean
    public ApplicationProperties.System system() {
        return applicationProperties.getSystem();
    }

    @Bean
    public ApplicationProperties.Datasource datasource() {
        return applicationProperties.getSystem().getDatasource();
    }

    @Bean(name = "runningProOrHigher")
    @Profile("default")
    public boolean runningProOrHigher() {
        return false;
    }

    @Bean(name = "runningEE")
    @Profile("default")
    public boolean runningEnterprise() {
        return false;
    }

    @Bean(name = "GoogleDriveEnabled")
    @Profile("default")
    public boolean googleDriveEnabled() {
        return false;
    }

    @Bean(name = "license")
    @Profile("default")
    public String licenseType() {
        return "NORMAL";
    }

    @Bean(name = "disablePixel")
    public boolean disablePixel() {
        return Boolean.parseBoolean(env.getProperty("DISABLE_PIXEL", "false"));
    }

    @Bean(name = "machineType")
    public String determineMachineType() {
        try {
            boolean isDocker = runningInDocker();
            boolean isKubernetes = System.getenv("KUBERNETES_SERVICE_HOST") != null;
            boolean isBrowserOpen = "true".equalsIgnoreCase(env.getProperty("BROWSER_OPEN"));

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
