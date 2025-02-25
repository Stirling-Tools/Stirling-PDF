package stirling.software.SPDF.config;

import java.io.File;
import java.nio.file.Paths;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class InstallationPathConfig {
    private static final String BASE_PATH;

    // Root paths
    private static final String LOG_PATH;
    private static final String CONFIG_PATH;
    private static final String CUSTOM_FILES_PATH;
    private static final String CLIENT_WEBUI_PATH;

    // Config paths
    private static final String SETTINGS_PATH;
    private static final String CUSTOM_SETTINGS_PATH;

    // Custom file paths
    private static final String STATIC_PATH;
    private static final String TEMPLATES_PATH;
    private static final String SIGNATURES_PATH;

    static {
        BASE_PATH = initializeBasePath();

        // Initialize root paths
        LOG_PATH = BASE_PATH + "logs" + File.separator;
        CONFIG_PATH = BASE_PATH + "configs" + File.separator;
        CUSTOM_FILES_PATH = BASE_PATH + "customFiles" + File.separator;
        CLIENT_WEBUI_PATH = BASE_PATH + "clientWebUI" + File.separator;

        // Initialize config paths
        SETTINGS_PATH = CONFIG_PATH + "settings.yml";
        CUSTOM_SETTINGS_PATH = CONFIG_PATH + "custom_settings.yml";

        // Initialize custom file paths
        STATIC_PATH = CUSTOM_FILES_PATH + "static" + File.separator;
        TEMPLATES_PATH = CUSTOM_FILES_PATH + "templates" + File.separator;
        SIGNATURES_PATH = CUSTOM_FILES_PATH + "signatures" + File.separator;
    }

    private static String initializeBasePath() {
        if (Boolean.parseBoolean(System.getProperty("STIRLING_PDF_DESKTOP_UI", "false"))) {
            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                return Paths.get(
                                        System.getenv("APPDATA"), // parent path
                                        "Stirling-PDF")
                                .toString()
                        + File.separator;
            } else if (os.contains("mac")) {
                return Paths.get(
                                        System.getProperty("user.home"),
                                        "Library",
                                        "Application Support",
                                        "Stirling-PDF")
                                .toString()
                        + File.separator;
            } else {
                return Paths.get(
                                        System.getProperty("user.home"), // parent path
                                        ".config",
                                        "Stirling-PDF")
                                .toString()
                        + File.separator;
            }
        }
        return "." + File.separator;
    }

    public static String getPath() {
        return BASE_PATH;
    }

    public static String getLogPath() {
        return LOG_PATH;
    }

    public static String getConfigPath() {
        return CONFIG_PATH;
    }

    public static String getCustomFilesPath() {
        return CUSTOM_FILES_PATH;
    }

    public static String getClientWebUIPath() {
        return CLIENT_WEBUI_PATH;
    }

    public static String getSettingsPath() {
        return SETTINGS_PATH;
    }

    public static String getCustomSettingsPath() {
        return CUSTOM_SETTINGS_PATH;
    }

    public static String getStaticPath() {
        return STATIC_PATH;
    }

    public static String getTemplatesPath() {
        return TEMPLATES_PATH;
    }

    public static String getSignaturesPath() {
        return SIGNATURES_PATH;
    }
}
