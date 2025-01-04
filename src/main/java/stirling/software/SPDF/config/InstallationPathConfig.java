package stirling.software.SPDF.config;

import java.io.File;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class InstallationPathConfig {

    public static String getPath() {
        if (Boolean.parseBoolean(
                java.lang.System.getProperty("STIRLING_PDF_DESKTOP_UI", "false"))) {

            String os = java.lang.System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                return java.lang.System.getenv("APPDATA")
                        + File.separator
                        + "Stirling-PDF"
                        + File.separator;
            } else if (os.contains("mac")) {
                return java.lang.System.getProperty("user.home")
                        + File.separator
                        + "Library"
                        + File.separator
                        + "Application Support"
                        + File.separator
                        + "Stirling-PDF"
                        + File.separator;
            } else {
                return java.lang.System.getProperty("user.home")
                        + File.separator
                        + ".config"
                        + File.separator
                        + "Stirling-PDF"
                        + File.separator;
            }
        }
        return "./";
    }

    // Root paths
    public static String getLogPath() {
        return getPath() + "logs" + File.separator;
    }

    public static String getConfigPath() {
        return getPath() + "configs" + File.separator;
    }

    public static String getPipelinePath() {
        return getPath() + "pipeline" + File.separator;
    }

    public static String getCustomFilesPath() {
        return getPath() + "customFiles" + File.separator;
    }

    public static String getClientWebUIPath() {
        return getPath() + "clientWebUI" + File.separator;
    }

    // configs
    public static String getSettingsPath() {
        log.info(getConfigPath() + "settings.yml");
        return getConfigPath() + "settings.yml";
    }

    public static String getCustomSettingsPath() {
        return getConfigPath() + "custom_settings.yml";
    }

    // pipeline
    public static String getPipelineWatchedFoldersDir() {
        return getPipelinePath() + "watchedFolders" + File.separator;
    }

    public static String getPipelineFinishedFoldersDir() {
        return getPipelinePath() + "finishedFolders" + File.separator;
    }

    // custom files
    public static String getStaticPath() {
        return getCustomFilesPath() + "static" + File.separator;
    }

    public static String getTemplatesPath() {
        return getCustomFilesPath() + "templates" + File.separator;
    }

    public static String getSignaturesPath() {
        return getCustomFilesPath() + "signatures" + File.separator;
    }
}
