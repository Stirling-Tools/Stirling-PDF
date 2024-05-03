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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
        String keyRegex = "^(\\w+):.*"; // Improved regex to capture the entire line including colon
        Pattern pattern = Pattern.compile(keyRegex);

        for (String line : lines) {
            Matcher matcher = pattern.matcher(line);
            if (matcher.find() && !line.trim().startsWith("#")) {
                String key = matcher.group(1).trim();
                entries.put(key, line);
            }
        }
        return entries;
    }

    private static List<String> mergeConfigs(
            List<String> templateLines,
            Map<String, String> templateEntries,
            Map<String, String> userEntries) {
        List<String> mergedLines = new ArrayList<>();
        Set<String> handledKeys = new HashSet<>();

        for (String line : templateLines) {
            String cleanLine = line.split("#")[0].trim();
            if (!cleanLine.isEmpty() && cleanLine.contains(":")) {
                String key = cleanLine.split(":")[0].trim();
                if (userEntries.containsKey(key)) {
                    // Add user's entry if exists, ensuring we get all sub-entries
                    if (userEntries.get(key).endsWith("{}")) {
                        // If the user entry ends with empty structure, add template version
                        mergedLines.add(line);
                    } else {
                        mergedLines.add(userEntries.get(key));
                    }
                    handledKeys.add(key);
                } else {
                    // Use template's entry
                    mergedLines.add(line);
                }
            } else {
                // Add comments and other lines directly
                mergedLines.add(line);
            }
        }

        // Add user entries not present in the template at the end
        for (String key : userEntries.keySet()) {
            if (!handledKeys.contains(key)) {
                if (!userEntries.get(key).endsWith("{}")) {
                    mergedLines.add(userEntries.get(key));
                }
            }
        }

        return mergedLines;
    }

    private static List<String> cleanInvalidYamlEntries(List<String> lines) {
        List<String> cleanedLines = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            String trimmedLine = line.trim();

            // Ignore commented lines and lines that don't look like key-only entries
            if (trimmedLine.startsWith("#")
                    || !trimmedLine.endsWith(":")
                    || trimmedLine.contains(" ")) {
                cleanedLines.add(line);
                continue;
            }

            // For potential key-only lines, check the next line to determine context
            if (isKeyWithoutChildrenOrValue(i, lines)) {
                // Skip adding the current line since it's a key without any following value or
                // children
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
