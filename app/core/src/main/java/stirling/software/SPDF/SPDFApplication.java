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
import java.util.regex.Pattern;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;

import io.github.pixee.security.SystemCommand;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.configuration.ConfigInitializer;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;

@Slf4j
@EnableScheduling
@SpringBootApplication(
        scanBasePackages = {
            "stirling.software.SPDF",
            "stirling.software.common",
            "stirling.software.proprietary"
        })
public class SPDFApplication {

    private static final Pattern PORT_SUFFIX_PATTERN = Pattern.compile(".+:\\d+$");
    private static final Pattern URL_SCHEME_PATTERN =
            Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*://.*");
    private static final Pattern TRAILING_SLASH_PATTERN = Pattern.compile("/+$");
    private static String serverPortStatic;
    private static String baseUrlStatic;
    private static String contextPathStatic;

    private final AppConfig appConfig;
    private final Environment env;
    private final ApplicationProperties applicationProperties;

    public SPDFApplication(
            AppConfig appConfig, Environment env, ApplicationProperties applicationProperties) {
        this.appConfig = appConfig;
        this.env = env;
        this.applicationProperties = applicationProperties;
    }

    public static void main(String[] args) throws IOException, InterruptedException {
        SpringApplication app = new SpringApplication(SPDFApplication.class);

        Properties props = new Properties();

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
        String backendUrl = appConfig.getBackendUrl();
        String contextPath = appConfig.getContextPath();
        String serverPort = appConfig.getServerPort();
        baseUrlStatic = normalizeBackendUrl(backendUrl, serverPort);
        contextPathStatic = contextPath;
        serverPortStatic = serverPort;
        String url = buildFullUrl(baseUrlStatic, getStaticPort(), contextPathStatic);

        // Log Tauri mode information
        if (Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"))) {
            String parentPid = System.getenv("TAURI_PARENT_PID");
            log.info(
                    "Running in Tauri mode. Parent process PID: {}",
                    parentPid != null ? parentPid : "not set");
        }
        // Standard browser opening logic
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

    public static void setServerPortStatic(String port) {
        if ("auto".equalsIgnoreCase(port)) {
            // Use Spring Boot's automatic port assignment (server.port=0)
            SPDFApplication.serverPortStatic =
                    "0"; // This will let Spring Boot assign an available port
        } else {
            SPDFApplication.serverPortStatic = port;
        }
    }

    @EventListener
    public void onWebServerInitialized(WebServerInitializedEvent event) {
        int actualPort = event.getWebServer().getPort();
        serverPortStatic = String.valueOf(actualPort);
        // Log the actual runtime port for Tauri to parse
        log.info("Stirling-PDF running on port: {}", actualPort);
    }

    private static void printStartupLogs() {
        log.info("Stirling-PDF Started.");
        String url = buildFullUrl(baseUrlStatic, getStaticPort(), contextPathStatic);
        log.info("Navigate to {}", url);
    }

    private static String[] getActiveProfile(String[] args) {
        // 1. Check for explicitly passed profiles
        if (args != null) {
            for (String arg : args) {
                if (arg.startsWith("--spring.profiles.active=")) {
                    String[] provided = arg.substring(arg.indexOf('=') + 1).split(",");
                    if (provided.length > 0) {
                        return provided;
                    }
                }
            }
        }

        // 2. Detect if SecurityConfiguration is present on classpath
        if (isClassPresent(
                "stirling.software.proprietary.security.configuration.SecurityConfiguration")) {
            log.info("Additional features in jar");
            return new String[] {"security"};
        } else {
            log.info("Without additional features in jar");
            return new String[] {"default"};
        }
    }

    private static boolean isClassPresent(String className) {
        try {
            Class.forName(className, false, SPDFApplication.class.getClassLoader());
            return true;
        } catch (ClassNotFoundException e) {
            return false;
        }
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

    private static String buildFullUrl(String backendUrl, String port, String contextPath) {
        String normalizedBase = normalizeBackendUrl(backendUrl, port);

        String normalizedContextPath =
                (contextPath == null || contextPath.isBlank() || "/".equals(contextPath))
                        ? "/"
                        : (contextPath.startsWith("/") ? contextPath : "/" + contextPath);

        return normalizedBase + normalizedContextPath;
    }

    private static String normalizeBackendUrl(String backendUrl, String port) {
        String trimmedBase =
                (backendUrl == null || backendUrl.isBlank())
                        ? "http://localhost"
                        : TRAILING_SLASH_PATTERN.matcher(backendUrl.trim()).replaceAll("");
        boolean hasScheme = URL_SCHEME_PATTERN.matcher(trimmedBase).matches();
        String baseForParsing = hasScheme ? trimmedBase : "http://" + trimmedBase;
        Integer parsedPort = parsePort(port);

        try {
            java.net.URI uri = new java.net.URI(baseForParsing);
            String scheme = uri.getScheme() == null ? "http" : uri.getScheme();
            String host = uri.getHost();
            if (host == null) {
                return appendPortFallback(trimmedBase, parsedPort);
            }

            boolean defaultHttp =
                    "http".equalsIgnoreCase(scheme) && Integer.valueOf(80).equals(parsedPort);
            boolean defaultHttps =
                    "https".equalsIgnoreCase(scheme) && Integer.valueOf(443).equals(parsedPort);

            int effectivePort = uri.getPort();
            if (effectivePort == -1 && parsedPort != null && !defaultHttp && !defaultHttps) {
                effectivePort = parsedPort;
            }

            java.net.URI rebuilt =
                    new java.net.URI(
                            scheme,
                            uri.getUserInfo(),
                            host,
                            effectivePort,
                            uri.getPath(),
                            uri.getQuery(),
                            uri.getFragment());
            return rebuilt.toString();
        } catch (java.net.URISyntaxException e) {
            return appendPortFallback(trimmedBase, parsedPort);
        }
    }

    private static Integer parsePort(String port) {
        if (port == null || port.isBlank()) {
            return null;
        }
        try {
            int parsed = Integer.parseInt(port);
            return parsed > 0 ? parsed : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String appendPortFallback(String trimmedBase, Integer port) {
        if (port == null) {
            return trimmedBase;
        }
        if (PORT_SUFFIX_PATTERN.matcher(trimmedBase).matches()) {
            return trimmedBase;
        }
        return trimmedBase + ":" + port;
    }
}
