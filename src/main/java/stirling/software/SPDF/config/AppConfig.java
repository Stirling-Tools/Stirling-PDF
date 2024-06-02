package stirling.software.SPDF.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;
import java.util.function.Predicate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.thymeleaf.spring6.SpringTemplateEngine;

import stirling.software.SPDF.model.ApplicationProperties;

@Configuration
@Lazy
public class AppConfig {

    private static final Logger logger = LoggerFactory.getLogger(AppConfig.class);

    @Autowired ApplicationProperties applicationProperties;

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
            logger.error("exception", e);
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

    @Bean(name = "watchedFoldersDir")
    public String watchedFoldersDir() {
        return "./pipeline/watchedFolders/";
    }

    @Bean(name = "finishedFoldersDir")
    public String finishedFoldersDir() {
        return "./pipeline/finishedFolders/";
    }

    @Bean(name = "directoryFilter")
    public Predicate<Path> processPDFOnlyFilter() {
        return path -> {
            if (Files.isDirectory(path)) {
                return !path.toString().contains("processing");
            } else {
                String fileName = path.getFileName().toString();
                return fileName.endsWith(".pdf");
            }
        };
    }
}
