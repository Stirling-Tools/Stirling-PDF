package stirling.software.SPDF.config;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;

public class ConfigInitializer
        implements ApplicationContextInitializer<ConfigurableApplicationContext> {

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
            Path templatePath =
                    Paths.get(
                            getClass()
                                    .getClassLoader()
                                    .getResource("settings.yml.template")
                                    .toURI());
            Path userPath = Paths.get("configs", "settings.yml");

            List<String> templateLines = Files.readAllLines(templatePath);
            List<String> userLines =
                    Files.exists(userPath) ? Files.readAllLines(userPath) : new ArrayList<>();

            List<String> resultLines = new ArrayList<>();

            for (String templateLine : templateLines) {
                // Check if the line is a comment
                if (templateLine.trim().startsWith("#")) {
                    String entry = templateLine.trim().substring(1).trim();
                    if (!entry.isEmpty()) {
                        // Check if this comment has been uncommented in userLines
                        String key = entry.split(":")[0].trim();
                        addLine(resultLines, userLines, templateLine, key);
                    } else {
                        resultLines.add(templateLine);
                    }
                }
                // Check if the line is a key-value pair
                else if (templateLine.contains(":")) {
                    String key = templateLine.split(":")[0].trim();
                    addLine(resultLines, userLines, templateLine, key);
                }
                // Handle empty lines
                else if (templateLine.trim().length() == 0) {
                    resultLines.add("");
                }
            }

            // Write the result to the user settings file
            Files.write(userPath, resultLines);
        }

        Path customSettingsPath = Paths.get("configs", "custom_settings.yml");
        if (!Files.exists(customSettingsPath)) {
            Files.createFile(customSettingsPath);
        }
    }

    // TODO check parent value instead of just indent lines for duplicate keys (like enabled etc)
    private static void addLine(
            List<String> resultLines, List<String> userLines, String templateLine, String key) {
        boolean added = false;
        int templateIndentationLevel = getIndentationLevel(templateLine);
        for (String settingsLine : userLines) {
            if (settingsLine.trim().startsWith(key + ":")) {
                int settingsIndentationLevel = getIndentationLevel(settingsLine);
                // Check if it is correct settingsLine and has the same parent as templateLine
                if (settingsIndentationLevel == templateIndentationLevel) {
                    resultLines.add(settingsLine);
                    added = true;
                    break;
                }
            }
        }
        if (!added) {
            resultLines.add(templateLine);
        }
    }

    private static int getIndentationLevel(String line) {
        int indentationLevel = 0;
        String trimmedLine = line.trim();
        if (trimmedLine.startsWith("#")) {
            line = trimmedLine.substring(1);
        }
        for (char c : line.toCharArray()) {
            if (c == ' ') {
                indentationLevel++;
            } else {
                break;
            }
        }
        return indentationLevel;
    }
}
