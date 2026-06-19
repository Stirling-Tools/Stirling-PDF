package stirling.software.SPDF;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

import org.eclipse.microprofile.config.Config;

import io.github.pixee.security.SystemCommand;
import io.quarkus.runtime.Quarkus;
import io.quarkus.runtime.QuarkusApplication;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.runtime.annotations.QuarkusMain;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.configuration.ConfigInitializer;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;

// MIGRATION (Spring -> Quarkus): @SpringBootApplication + SpringApplication.run replaced by
// @QuarkusMain + QuarkusApplication.run(args)/Quarkus.waitForExit(). @EnableScheduling is removed -
// Quarkus enables io.quarkus.scheduler.Scheduled out of the box, no app-level toggle needed.
// The former @PostConstruct init() and @EventListener(ApplicationReadyEvent) startup hooks now live
// in the nested @ApplicationScoped StartupObserver bean (the entry-point class itself is NOT a CDI
// bean). External config files were wired via "spring.config.additional-location"; in Quarkus that
// is replaced by SmallRye Config sources - see the TODO in main().
@Slf4j
@QuarkusMain
public class SPDFApplication implements QuarkusApplication {

    private static final Pattern PORT_SUFFIX_PATTERN = Pattern.compile(".+:\\d+$");
    private static final Pattern URL_SCHEME_PATTERN =
            Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*://.*");
    private static final Pattern TRAILING_SLASH_PATTERN = Pattern.compile("/+$");
    private static String serverPortStatic;
    private static String baseUrlStatic;
    private static String contextPathStatic;

    public static void main(String[] args) {
        // ConfigInitializer must run before the Quarkus runtime boots so that the external settings
        // files exist on disk and can be picked up by config sources.
        ConfigInitializer initializer = new ConfigInitializer();
        try {
            initializer.ensureConfigExists();
        } catch (IOException | java.net.URISyntaxException e) {
            log.error("Error initialising configuration", e);
        }

        // External config files
        Path settingsPath = Path.of(InstallationPathConfig.getSettingsPath());
        log.info("Settings file: {}", settingsPath.toString());
        if (!Files.exists(settingsPath)) {
            log.warn("External configuration file '{}' does not exist.", settingsPath.toString());
        }
        Path customSettingsPath = Path.of(InstallationPathConfig.getCustomSettingsPath());
        log.info("Custom settings file: {}", customSettingsPath.toString());
        if (!Files.exists(customSettingsPath)) {
            log.warn(
                    "Custom configuration file '{}' does not exist.",
                    customSettingsPath.toString());
        }

        // TODO: Migration required - the Spring "spring.config.additional-location" property used
        // to
        // load the external settings/customSettings YAML files into the environment. Quarkus uses
        // SmallRye Config; wire these files via a config source instead, e.g. set the system
        // property
        // "smallrye.config.locations" to the (comma-separated) file: URLs before this point, or
        // register a custom ConfigSourceFactory. The directories/log lines above are preserved.

        // TODO: Migration required - profile auto-detection (former getActiveProfile / Spring
        // setAdditionalProfiles) must be expressed via "quarkus.profile". The classpath-shape
        // detection logic is retained below in getActiveProfile(); translate its result into the
        // "quarkus.profile" system property (e.g. System.setProperty("quarkus.profile", ...))
        // before
        // Quarkus.run if profile-based config layering is required.
        getActiveProfile(args);

        Quarkus.run(SPDFApplication.class, args);
    }

    @Override
    public int run(String... args) throws Exception {
        printStartupLogs();
        Quarkus.waitForExit();
        return 0;
    }

    /**
     * Startup observer carrying the former {@code @PostConstruct init()} and
     * {@code @EventListener(ApplicationReadyEvent)} logic. This is the CDI bean (the entry-point
     * class above is not managed by Arc).
     */
    @ApplicationScoped
    public static class StartupObserver {

        private final AppConfig appConfig;
        private final Config config;
        private final ApplicationProperties applicationProperties;

        @Inject
        public StartupObserver(
                AppConfig appConfig, Config config, ApplicationProperties applicationProperties) {
            this.appConfig = appConfig;
            this.config = config;
            this.applicationProperties = applicationProperties;
        }

        void onStart(@Observes StartupEvent event) {
            // Ensure directories are created (was after SpringApplication.run in main()).
            try {
                Files.createDirectories(Path.of(InstallationPathConfig.getTemplatesPath()));
                Files.createDirectories(Path.of(InstallationPathConfig.getStaticPath()));
            } catch (IOException e) {
                log.error("Error creating directories: {}", e.getMessage());
            }

            init();
            onApplicationReady();
        }

        // Former @PostConstruct init().
        private void init() {
            String backendUrl = appConfig.getBackendUrl();
            String contextPath = appConfig.getContextPath();
            String serverPort = appConfig.getServerPort();
            baseUrlStatic = normalizeBackendUrl(backendUrl, serverPort);
            contextPathStatic = contextPath;
            serverPortStatic = serverPort;
            String url = buildFullUrl(baseUrlStatic, serverPortStatic, contextPathStatic);

            // Log Tauri mode information
            if (Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"))) {
                String parentPid = System.getenv("TAURI_PARENT_PID");
                log.info(
                        "Running in Tauri mode. Parent process PID: {}",
                        parentPid != null ? parentPid : "not set");
            }
            // Standard browser opening logic
            String browserOpenEnv =
                    config.getOptionalValue("BROWSER_OPEN", String.class).orElse(null);
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

        // Former @EventListener(ApplicationReadyEvent) onApplicationReady().
        private void onApplicationReady() {
            // TODO: Migration required - the Spring "local.server.port" property exposed the actual
            // runtime port (relevant for server.port=0 / "auto" port assignment). In Quarkus read
            // the resolved port from config "quarkus.http.port" (or observe an HTTP-started event)
            // and update serverPortStatic here. Falling back to the configured value for now.
            String port = config.getOptionalValue("quarkus.http.port", String.class).orElse(null);
            if (port != null) {
                serverPortStatic = port;
            }
            // Log the actual runtime port for Tauri to parse
            log.info("Stirling-PDF running on port: {}", serverPortStatic);
        }
    }

    public static void setServerPortStatic(String port) {
        if ("auto".equalsIgnoreCase(port)) {
            // Use automatic port assignment (port 0)
            SPDFApplication.serverPortStatic = "0"; // This will let the server assign an open port
        } else {
            SPDFApplication.serverPortStatic = port;
        }
    }

    private static void printStartupLogs() {
        log.info("Stirling-PDF Started.");
        String url = buildFullUrl(baseUrlStatic, serverPortStatic, contextPathStatic);
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

        // 2. Detect classpath shape and pick the matching profile chain.
        boolean hasSaas = isClassPresent("stirling.software.saas.security.SupabaseSecurityConfig");
        boolean hasSecurity =
                isClassPresent(
                        "stirling.software.proprietary.security.configuration.SecurityConfiguration");

        if (hasSaas) {
            log.info("SaaS features in jar");
            return new String[] {"security", "saas"};
        }
        if (hasSecurity) {
            log.info("Additional features in jar");
            return new String[] {"security"};
        }
        log.info("Without additional features in jar");
        return new String[] {"default"};
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
