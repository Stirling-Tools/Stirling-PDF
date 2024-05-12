package stirling.software.SPDF.config;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

            Map<String, String> templateEntries = extractEntries(templateLines);
            Map<String, String> userEntries = extractEntries(userLines);

            List<String> mergedLines = mergeConfigs(templateLines, templateEntries, userEntries);
            mergedLines = cleanInvalidYamlEntries(mergedLines);
            Files.write(userPath, mergedLines);
        }

        Path customSettingsPath = Paths.get("configs", "custom_settings.yml");
        if (!Files.exists(customSettingsPath)) {
            Files.createFile(customSettingsPath);
        }
    }

    private static Map<String, String> extractEntries(List<String> lines) {
        Map<String, String> entries = new HashMap<>();
        StringBuilder currentEntry = new StringBuilder();
        String currentKey = null;
        int blockIndent = -1;

        for (String line : lines) {
            if (line.trim().isEmpty()) {
                if (currentKey != null) {
                    currentEntry.append(line).append("\n");
                }
                continue;
            }

            int indentLevel = getIndentationLevel(line);
            if (line.trim().startsWith("#")) {
                if (indentLevel <= blockIndent || blockIndent == -1) {
                    if (currentKey != null) {
                        entries.put(currentKey, currentEntry.toString().trim());
                        currentEntry = new StringBuilder();
                    }
                    currentKey = line.trim().replaceAll("#", "").split(":")[0].trim();
                    blockIndent = indentLevel;
                }
                currentEntry.append(line).append("\n");
            } else if (indentLevel == 0 || indentLevel <= blockIndent) {
                if (currentKey != null) {
                    entries.put(currentKey, currentEntry.toString().trim());
                    currentEntry = new StringBuilder();
                }
                currentKey = line.split(":")[0].trim();
                blockIndent = indentLevel;
                currentEntry.append(line).append("\n");
            } else {
                currentEntry.append(line).append("\n");
            }
        }

        if (currentKey != null) {
            entries.put(currentKey, currentEntry.toString().trim());
        }

        return entries;
    }

    private static List<String> mergeConfigs(
            List<String> templateLines,
            Map<String, String> templateEntries,
            Map<String, String> userEntries) {
        List<String> mergedLines = new ArrayList<>();
        Set<String> handledKeys = new HashSet<>();

        String currentBlockKey = null;
        int blockIndent = -1;

        for (String line : templateLines) {
            if (line.trim().isEmpty()) {
                mergedLines.add(line);
                continue;
            }

            int indentLevel = getIndentationLevel(line);
            if (indentLevel == 0 || (indentLevel <= blockIndent && !line.trim().startsWith("#"))) {
                currentBlockKey = line.split(":")[0].trim();
                blockIndent = indentLevel;
            }

            if (userEntries.containsKey(currentBlockKey)
                    && !handledKeys.contains(currentBlockKey)) {
                mergedLines.add(userEntries.get(currentBlockKey));
                handledKeys.add(currentBlockKey);
            } else if (!handledKeys.contains(currentBlockKey)) {
                mergedLines.add(line);
            }
        }

        return mergedLines;
    }

    private static List<String> cleanInvalidYamlEntries(List<String> lines) {
        List<String> cleanedLines = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            String trimmedLine = line.trim();

            if (trimmedLine.startsWith("#")
                    || !trimmedLine.endsWith(":")
                    || trimmedLine.contains(" ")) {
                cleanedLines.add(line);
                continue;
            }

            if (isKeyWithoutChildrenOrValue(i, lines)) {
                continue;
            }

            cleanedLines.add(line);
        }
        return cleanedLines;
    }

    private static boolean isKeyWithoutChildrenOrValue(int currentIndex, List<String> lines) {
        if (currentIndex + 1 < lines.size()) {
            String currentLine = lines.get(currentIndex);
            String nextLine = lines.get(currentIndex + 1);
            int currentIndentation = getIndentationLevel(currentLine);
            int nextIndentation = getIndentationLevel(nextLine);

            // If the next line is less or equally indented, it's not a child or value
            return nextIndentation <= currentIndentation;
        }

        // If it's the last line, then it definitely has no children or value
        return true;
    }

    private static int getIndentationLevel(String line) {
        int count = 0;
        for (char ch : line.toCharArray()) {
            if (ch == ' ') count++;
            else break;
        }
        return count;
    }
}
