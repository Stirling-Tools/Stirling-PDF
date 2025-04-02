package stirling.software.SPDF;

import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;

import io.github.pixee.security.SystemCommand;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.UI.WebBrowser;
import stirling.software.SPDF.config.ConfigInitializer;
import stirling.software.SPDF.config.InstallationPathConfig;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.UrlUtils;

@Slf4j
@EnableScheduling
@SpringBootApplication
public class SPDFApplication {

    private static String serverPortStatic;
    private static String baseUrlStatic;
    private static String contextPathStatic;

    private final Environment env;
    private final ApplicationProperties applicationProperties;
    private final WebBrowser webBrowser;

    @Value("${baseUrl:http://localhost}")
    private String baseUrl;

    @Value("${server.servlet.context-path:/}")
    private String contextPath;

    public SPDFApplication(
            Environment env,
            ApplicationProperties applicationProperties,
            @Autowired(required = false) WebBrowser webBrowser) {
        this.env = env;
        this.applicationProperties = applicationProperties;
        this.webBrowser = webBrowser;
    }

    public static void main(String[] args) throws IOException, InterruptedException {
        SpringApplication app = new SpringApplication(SPDFApplication.class);

        Properties props = new Properties();

        if (Boolean.parseBoolean(System.getProperty("STIRLING_PDF_DESKTOP_UI", "false"))) {
            System.setProperty("java.awt.headless", "false");
            app.setHeadless(false);
            props.put("java.awt.headless", "false");
            props.put("spring.main.web-application-type", "servlet");

            int desiredPort = 8080;
            String port = UrlUtils.findAvailablePort(desiredPort);
            props.put("server.port", port);
            System.setProperty("server.port", port);
            log.info("Desktop UI mode: Using port {}", port);
        }

        app.setAdditionalProfiles(getActiveProfile(args));

        ConfigInitializer initializer = new ConfigInitializer();
        try {
            initializer.ensureConfigExists();
        } catch (IOException | URISyntaxException e) {
            log.error("Error initialising configuration", e);
        }
        Map<String, String> propertyFiles = new HashMap<>();

        // External config files
        Path settingsPath = Paths.get(InstallationPathConfig.getSettingsPath());
        log.info("Settings file: {}", settingsPath.toString());
        if (Files.exists(settingsPath)) {
            propertyFiles.put(
                    "spring.config.additional-location", "file:" + settingsPath.toString());
        } else {
            log.warn("External configuration file '{}' does not exist.", settingsPath.toString());
        }

        Path customSettingsPath = Paths.get(InstallationPathConfig.getCustomSettingsPath());
        log.info("Custom settings file: {}", customSettingsPath.toString());
        if (Files.exists(customSettingsPath)) {
            String existingLocation =
                    propertyFiles.getOrDefault("spring.config.additional-location", "");
            if (!existingLocation.isEmpty()) {
                existingLocation += ",";
            }
            propertyFiles.put(
                    "spring.config.additional-location",
                    existingLocation + "file:" + customSettingsPath.toString());
        } else {
            log.warn(
                    "Custom configuration file '{}' does not exist.",
                    customSettingsPath.toString());
        }
        Properties finalProps = new Properties();

        if (!propertyFiles.isEmpty()) {
            finalProps.putAll(
                    Collections.singletonMap(
                            "spring.config.additional-location",
                            propertyFiles.get("spring.config.additional-location")));
        }

        if (!props.isEmpty()) {
            finalProps.putAll(props);
        }
        app.setDefaultProperties(finalProps);

        app.run(args);

        // Ensure directories are created
        try {
            Files.createDirectories(Path.of(InstallationPathConfig.getTemplatesPath()));
            Files.createDirectories(Path.of(InstallationPathConfig.getStaticPath()));
        } catch (IOException e) {
            log.error("Error creating directories: {}", e.getMessage());
        }

        printStartupLogs();
    }

    @PostConstruct
    public void init() {
        baseUrlStatic = this.baseUrl;
        contextPathStatic = this.contextPath;
        String url = baseUrl + ":" + getStaticPort() + contextPath;
        if (webBrowser != null
                && Boolean.parseBoolean(System.getProperty("STIRLING_PDF_DESKTOP_UI", "false"))) {
            webBrowser.initWebUI(url);
        } else {
            String browserOpenEnv = env.getProperty("BROWSER_OPEN");
            boolean browserOpen = browserOpenEnv != null && "true".equalsIgnoreCase(browserOpenEnv);
            if (browserOpen) {
                try {
                    String os = System.getProperty("os.name").toLowerCase();
                    Runtime rt = Runtime.getRuntime();
                    if (os.contains("win")) {
                        // For Windows
                        SystemCommand.runCommand(rt, "rundll32 url.dll,FileProtocolHandler " + url);
                    } else if (os.contains("mac")) {
                        SystemCommand.runCommand(rt, "open " + url);
                    } else if (os.contains("nix") || os.contains("nux")) {
                        SystemCommand.runCommand(rt, "xdg-open " + url);
                    }
                } catch (IOException e) {
                    log.error("Error opening browser: {}", e.getMessage());
                }
            }
        }
        log.info("Running configs {}", applicationProperties.toString());
    }

    @Value("${server.port:8080}")
    public void setServerPort(String port) {
        if ("auto".equalsIgnoreCase(port)) {
            // Use Spring Boot's automatic port assignment (server.port=0)
            SPDFApplication.serverPortStatic =
                    "0"; // This will let Spring Boot assign an available port
        } else {
            SPDFApplication.serverPortStatic = port;
        }
    }

    public static void setServerPortStatic(String port) {
        if ("auto".equalsIgnoreCase(port)) {
            // Use Spring Boot's automatic port assignment (server.port=0)
            SPDFApplication.serverPortStatic =
                    "0"; // This will let Spring Boot assign an available port
        } else {
            SPDFApplication.serverPortStatic = port;
        }
    }

    @PreDestroy
    public void cleanup() {
        if (webBrowser != null) {
            webBrowser.cleanup();
        }
    }

    private static void printStartupLogs() {
        log.info("Stirling-PDF Started.");
        String url = baseUrlStatic + ":" + getStaticPort() + contextPathStatic;
        log.info("Navigate to {}", url);
    }

    private static String[] getActiveProfile(String[] args) {
        if (args == null) {
            return new String[] {"default"};
        }

        for (String arg : args) {
            if (arg.contains("spring.profiles.active")) {
                return arg.substring(args[0].indexOf('=') + 1).split(", ");
            }
        }

        return new String[] {"default"};
    }

    public static String getStaticBaseUrl() {
        return baseUrlStatic;
    }

    public static String getStaticPort() {
        return serverPortStatic;
    }

    public static String getStaticContextPath() {
        return contextPathStatic;
    }
}
