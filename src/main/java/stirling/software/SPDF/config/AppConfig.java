package stirling.software.SPDF.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;
import java.util.function.Predicate;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Scope;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.thymeleaf.spring6.SpringTemplateEngine;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.ApplicationProperties;

@Configuration
@Lazy
@Slf4j
public class AppConfig {

    private final ApplicationProperties applicationProperties;

    public AppConfig(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    @Bean
    @ConditionalOnProperty(
            name = "system.customHTMLFiles",
            havingValue = "true",
            matchIfMissing = false)
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
        String appName = System.getProperty("rateLimit");
        if (appName == null) appName = System.getenv("rateLimit");
        return (appName != null) ? Boolean.valueOf(appName) : false;
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
        try {
            return Files.lines(mountInfo).anyMatch(line -> line.contains(" /configs "));
        } catch (IOException e) {
            return false;
        }
    }

    @Bean(name = "bookAndHtmlFormatsInstalled")
    public boolean bookAndHtmlFormatsInstalled() {
        String installOps = System.getProperty("INSTALL_BOOK_AND_ADVANCED_HTML_OPS");
        if (installOps == null) {
            installOps = System.getenv("INSTALL_BOOK_AND_ADVANCED_HTML_OPS");
        }
        return "true".equalsIgnoreCase(installOps);
    }

    @ConditionalOnMissingClass("stirling.software.SPDF.config.security.SecurityConfiguration")
    @Bean(name = "activSecurity")
    public boolean missingActivSecurity() {
        return false;
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
        return applicationProperties.getSystem().getEnableAnalytics() == null
                || "undefined".equals(applicationProperties.getSystem().getEnableAnalytics());
    }

    @Bean(name = "analyticsEnabled")
    @Scope("request")
    public boolean analyticsEnabled() {
        if (applicationProperties.getEnterpriseEdition().isEnabled()) return true;
        return applicationProperties.getSystem().getEnableAnalytics() != null
                && Boolean.parseBoolean(applicationProperties.getSystem().getEnableAnalytics());
    }

    @Bean(name = "StirlingPDFLabel")
    public String stirlingPDFLabel() {
        return "Stirling-PDF" + " v" + appVersion();
    }

    @Bean(name = "UUID")
    public String uuid() {
        return applicationProperties.getAutomaticallyGenerated().getUUID();
    }
}
