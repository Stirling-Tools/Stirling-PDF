package stirling.software.SPDF.config;

import java.io.File;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class InstallationPathConfig {
    private static final String BASE_PATH;

    // Root paths
    private static final String LOG_PATH;
    private static final String CONFIG_PATH;
    private static final String PIPELINE_PATH;
    private static final String CUSTOM_FILES_PATH;
    private static final String CLIENT_WEBUI_PATH;

    // Config paths
    private static final String SETTINGS_PATH;
    private static final String CUSTOM_SETTINGS_PATH;

    // Pipeline paths
    private static final String PIPELINE_WATCHED_FOLDERS_PATH;
    private static final String PIPELINE_FINISHED_FOLDERS_PATH;
    private static final String PIPELINE_DEFAULT_WEB_UI_CONFIGS;

    // Custom file paths
    private static final String STATIC_PATH;
    private static final String TEMPLATES_PATH;
    private static final String SIGNATURES_PATH;

    static {
        BASE_PATH = initializeBasePath();

        // Initialize root paths
        LOG_PATH = BASE_PATH + "logs" + File.separator;
        CONFIG_PATH = BASE_PATH + "configs" + File.separator;
        PIPELINE_PATH = BASE_PATH + "pipeline" + File.separator;
        CUSTOM_FILES_PATH = BASE_PATH + "customFiles" + File.separator;
        CLIENT_WEBUI_PATH = BASE_PATH + "clientWebUI" + File.separator;

        // Initialize config paths
        SETTINGS_PATH = CONFIG_PATH + "settings.yml";
        CUSTOM_SETTINGS_PATH = CONFIG_PATH + "custom_settings.yml";

        // Initialize pipeline paths
        PIPELINE_WATCHED_FOLDERS_PATH = PIPELINE_PATH + "watchedFolders" + File.separator;
        PIPELINE_FINISHED_FOLDERS_PATH = PIPELINE_PATH + "finishedFolders" + File.separator;
        PIPELINE_DEFAULT_WEB_UI_CONFIGS = PIPELINE_PATH + "defaultWebUIConfigs" + File.separator;

        // Initialize custom file paths
        STATIC_PATH = CUSTOM_FILES_PATH + "static" + File.separator;
        TEMPLATES_PATH = CUSTOM_FILES_PATH + "templates" + File.separator;
        SIGNATURES_PATH = CUSTOM_FILES_PATH + "signatures" + File.separator;
    }

    private static String initializeBasePath() {
        if (Boolean.parseBoolean(System.getProperty("STIRLING_PDF_DESKTOP_UI", "false"))) {
            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                return System.getenv("APPDATA") + File.separator + "Stirling-PDF" + File.separator;
            } else if (os.contains("mac")) {
                return System.getProperty("user.home")
                        + File.separator
                        + "Library"
                        + File.separator
                        + "Application Support"
                        + File.separator
                        + "Stirling-PDF"
                        + File.separator;
            } else {
                return System.getProperty("user.home")
                        + File.separator
                        + ".config"
                        + File.separator
                        + "Stirling-PDF"
                        + File.separator;
            }
        }
        return "./";
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

    public static String getPipelinePath() {
        return PIPELINE_PATH;
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

    public static String getPipelineWatchedFoldersDir() {
        return PIPELINE_WATCHED_FOLDERS_PATH;
    }

    public static String getPipelineFinishedFoldersDir() {
        return PIPELINE_FINISHED_FOLDERS_PATH;
    }

    public static String getPipelineDefaultWebUIConfigsDir() {
        return PIPELINE_DEFAULT_WEB_UI_CONFIGS;
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
