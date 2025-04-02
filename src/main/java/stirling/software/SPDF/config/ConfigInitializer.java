package stirling.software.SPDF.config;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;

import lombok.extern.slf4j.Slf4j;

/**
 * A naive, line-based approach to merging "settings.yml" with "settings.yml.template" while
 * preserving exact whitespace, blank lines, and inline comments -- but we only rewrite the file if
 * the merged content actually differs.
 */
@Slf4j
public class ConfigInitializer {

    public void ensureConfigExists() throws IOException, URISyntaxException {
        // 1) If settings file doesn't exist, create from template
        Path destPath = Paths.get(InstallationPathConfig.getSettingsPath());
        if (Files.notExists(destPath)) {
            Files.createDirectories(destPath.getParent());
            try (InputStream in =
                    getClass().getClassLoader().getResourceAsStream("settings.yml.template")) {
                if (in == null) {
                    throw new FileNotFoundException(
                            "Resource file not found: settings.yml.template");
                }
                Files.copy(in, destPath);
            }
            log.info("Created settings file from template");
        } else {
            // 2) Merge existing file with the template
            URL templateResource = getClass().getClassLoader().getResource("settings.yml.template");
            if (templateResource == null) {
                throw new IOException("Resource not found: settings.yml.template");
            }

            // Copy template to a temp location so we can read lines
            Path tempTemplatePath = Files.createTempFile("settings.yml", ".template");
            try (InputStream in = templateResource.openStream()) {
                Files.copy(in, tempTemplatePath, StandardCopyOption.REPLACE_EXISTING);
            }

            // Copy setting.yaml to a temp location so we can read lines
            Path settingTempPath = Files.createTempFile("settings", ".yaml");
            try (InputStream in = Files.newInputStream(destPath)) {
                Files.copy(in, settingTempPath, StandardCopyOption.REPLACE_EXISTING);
            }

            YamlHelper settingsTemplateFile = new YamlHelper(tempTemplatePath);
            YamlHelper settingsFile = new YamlHelper(settingTempPath);

            migrateEnterpriseEditionToPremium(settingsFile, settingsTemplateFile);

            boolean changesMade =
                    settingsTemplateFile.updateValuesFromYaml(settingsFile, settingsTemplateFile);
            if (changesMade) {
                settingsTemplateFile.save(destPath);
                log.info("Settings file updated based on template changes.");
            } else {
                log.info("No changes detected; settings file left as-is.");
            }

            Files.deleteIfExists(tempTemplatePath);
            Files.deleteIfExists(settingTempPath);
        }

        // 3) Ensure custom settings file exists
        Path customSettingsPath = Paths.get(InstallationPathConfig.getCustomSettingsPath());
        if (Files.notExists(customSettingsPath)) {
            Files.createFile(customSettingsPath);
            log.info("Created custom_settings file: {}", customSettingsPath.toString());
        }
    }

    // TODO: Remove post migration
    private void migrateEnterpriseEditionToPremium(YamlHelper yaml, YamlHelper template) {
        if (yaml.getValueByExactKeyPath("enterpriseEdition", "enabled") != null) {
            template.updateValue(
                    List.of("premium", "enabled"),
                    yaml.getValueByExactKeyPath("enterpriseEdition", "enabled"));
        }
        if (yaml.getValueByExactKeyPath("enterpriseEdition", "key") != null) {
            template.updateValue(
                    List.of("premium", "key"),
                    yaml.getValueByExactKeyPath("enterpriseEdition", "key"));
        }
        if (yaml.getValueByExactKeyPath("enterpriseEdition", "SSOAutoLogin") != null) {
            template.updateValue(
                    List.of("premium", "proFeatures", "SSOAutoLogin"),
                    yaml.getValueByExactKeyPath("enterpriseEdition", "SSOAutoLogin"));
        }
        if (yaml.getValueByExactKeyPath("enterpriseEdition", "CustomMetadata", "autoUpdateMetadata")
                != null) {
            template.updateValue(
                    List.of("premium", "proFeatures", "CustomMetadata", "autoUpdateMetadata"),
                    yaml.getValueByExactKeyPath(
                            "enterpriseEdition", "CustomMetadata", "autoUpdateMetadata"));
        }
        if (yaml.getValueByExactKeyPath("enterpriseEdition", "CustomMetadata", "author") != null) {
            template.updateValue(
                    List.of("premium", "proFeatures", "CustomMetadata", "author"),
                    yaml.getValueByExactKeyPath("enterpriseEdition", "CustomMetadata", "author"));
        }
        if (yaml.getValueByExactKeyPath("enterpriseEdition", "CustomMetadata", "creator") != null) {
            template.updateValue(
                    List.of("premium", "proFeatures", "CustomMetadata", "creator"),
                    yaml.getValueByExactKeyPath("enterpriseEdition", "CustomMetadata", "creator"));
        }
        if (yaml.getValueByExactKeyPath("enterpriseEdition", "CustomMetadata", "producer")
                != null) {
            template.updateValue(
                    List.of("premium", "proFeatures", "CustomMetadata", "producer"),
                    yaml.getValueByExactKeyPath("enterpriseEdition", "CustomMetadata", "producer"));
        }
    }
}
