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
import java.util.Arrays;
import java.util.List;

import org.simpleyaml.configuration.comments.CommentType;
import org.simpleyaml.configuration.file.YamlFile;
import org.simpleyaml.configuration.implementation.SimpleYamlImplementation;
import org.simpleyaml.configuration.implementation.snakeyaml.lib.DumperOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;

public class ConfigInitializer
        implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    private static final Logger logger = LoggerFactory.getLogger(ConfigInitializer.class);

    @Override
    public void initialize(ConfigurableApplicationContext applicationContext) {
        try {
            ensureConfigExists();
        } catch (Exception e) {
            throw new RuntimeException("Failed to initialize application configuration", e);
        }
    }

    public void ensureConfigExists() throws IOException, URISyntaxException {
        // Define the path to the external config directory
        Path destPath = Paths.get("configs", "settings.yml");

        // Check if the file already exists
        if (Files.notExists(destPath)) {
            // Ensure the destination directory exists
            Files.createDirectories(destPath.getParent());

            // Copy the resource from classpath to the external directory
            try (InputStream in =
                    getClass().getClassLoader().getResourceAsStream("settings.yml.template")) {
                if (in != null) {
                    Files.copy(in, destPath);
                } else {
                    throw new FileNotFoundException(
                            "Resource file not found: settings.yml.template");
                }
            }
        } else {

            // Define the path to the config settings file
            Path settingsPath = Paths.get("configs", "settings.yml");
            // Load the template resource
            URL settingsTemplateResource =
                    getClass().getClassLoader().getResource("settings.yml.template");
            if (settingsTemplateResource == null) {
                throw new IOException("Resource not found: settings.yml.template");
            }

            // Create a temporary file to copy the resource content
            Path tempTemplatePath = Files.createTempFile("settings.yml", ".template");

            try (InputStream in = settingsTemplateResource.openStream()) {
                Files.copy(in, tempTemplatePath, StandardCopyOption.REPLACE_EXISTING);
            }

            final YamlFile settingsTemplateFile = new YamlFile(tempTemplatePath.toFile());
            DumperOptions yamlOptionsSettingsTemplateFile =
                    ((SimpleYamlImplementation) settingsTemplateFile.getImplementation())
                            .getDumperOptions();
            yamlOptionsSettingsTemplateFile.setSplitLines(false);
            settingsTemplateFile.loadWithComments();

            final YamlFile settingsFile = new YamlFile(settingsPath.toFile());
            DumperOptions yamlOptionsSettingsFile =
                    ((SimpleYamlImplementation) settingsFile.getImplementation())
                            .getDumperOptions();
            yamlOptionsSettingsFile.setSplitLines(false);
            settingsFile.loadWithComments();

            // Load headers and comments
            String header = settingsTemplateFile.getHeader();

            // Create a new file for temporary settings
            final YamlFile tempSettingFile = new YamlFile(settingsPath.toFile());
            DumperOptions yamlOptionsTempSettingFile =
                    ((SimpleYamlImplementation) tempSettingFile.getImplementation())
                            .getDumperOptions();
            yamlOptionsTempSettingFile.setSplitLines(false);
            tempSettingFile.createNewFile(true);
            tempSettingFile.setHeader(header);

            // Get all keys from the template
            List<String> keys =
                    Arrays.asList(settingsTemplateFile.getKeys(true).toArray(new String[0]));

            for (String key : keys) {
                if (!key.contains(".")) {
                    // Add blank lines and comments to specific sections
                    tempSettingFile
                            .path(key)
                            .comment(settingsTemplateFile.getComment(key))
                            .blankLine();
                    continue;
                }
                // Copy settings from the template to the settings.yml file
                changeConfigItemFromCommentToKeyValue(
                        settingsTemplateFile, settingsFile, tempSettingFile, key);
            }

            // Save the settings.yml file
            tempSettingFile.save();
        }

        // Create custom settings file if it doesn't exist
        Path customSettingsPath = Paths.get("configs", "custom_settings.yml");
        if (!Files.exists(customSettingsPath)) {
            Files.createFile(customSettingsPath);
        }
    }

    private void changeConfigItemFromCommentToKeyValue(
            final YamlFile settingsTemplateFile,
            final YamlFile settingsFile,
            final YamlFile tempSettingFile,
            String path) {
        if (settingsFile.get(path) == null && settingsTemplateFile.get(path) != null) {
            // If the key is only in the template, add it to the temporary settings with comments
            tempSettingFile
                    .path(path)
                    .set(settingsTemplateFile.get(path))
                    .comment(settingsTemplateFile.getComment(path, CommentType.BLOCK))
                    .commentSide(settingsTemplateFile.getComment(path, CommentType.SIDE));
        } else if (settingsFile.get(path) != null && settingsTemplateFile.get(path) != null) {
            // If the key is in both, update the temporary settings with the main settings' value
            // and comments
            tempSettingFile
                    .path(path)
                    .set(settingsFile.get(path))
                    .comment(settingsTemplateFile.getComment(path, CommentType.BLOCK))
                    .commentSide(settingsTemplateFile.getComment(path, CommentType.SIDE));
        } else {
            // Log if the key is not found in both YAML files
            logger.info("Key not found in both YAML files: " + path);
        }
    }
}
