package stirling.software.SPDF.config;

import java.io.BufferedReader;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;

public class ConfigInitializer
        implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    @Override
    public void initialize(ConfigurableApplicationContext applicationContext) {
        try {
            ensureConfigExists();
        } catch (IOException e) {
            throw new RuntimeException("Failed to initialize application configuration", e);
        }
    }

    public void ensureConfigExists() throws IOException {
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
            // If user file exists, we need to merge it with the template from the classpath
            List<String> templateLines;
            try (InputStream in =
                    getClass().getClassLoader().getResourceAsStream("settings.yml.template")) {
                templateLines =
                        new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))
                                .lines()
                                .collect(Collectors.toList());
            }

            mergeYamlFiles(templateLines, destPath, destPath);
        }
    }

    public void mergeYamlFiles(List<String> templateLines, Path userFilePath, Path outputPath)
            throws IOException {
        List<String> userLines = Files.readAllLines(userFilePath);
        List<String> mergedLines = new ArrayList<>();
        boolean insideAutoGenerated = false;
        boolean beforeFirstKey = true;

        Function<String, Boolean> isCommented = line -> line.trim().startsWith("#");
        Function<String, String> extractKey =
                line -> {
                    String[] parts = line.split(":");
                    return parts.length > 0 ? parts[0].trim().replace("#", "").trim() : "";
                };

        Function<String, Integer> getIndentationLevel =
                line -> {
                    int count = 0;
                    for (char ch : line.toCharArray()) {
                        if (ch == ' ') count++;
                        else break;
                    }
                    return count;
                };

        Set<String> userKeys = userLines.stream().map(extractKey).collect(Collectors.toSet());

        for (String line : templateLines) {
            String key = extractKey.apply(line);

            if ("AutomaticallyGenerated:".equalsIgnoreCase(line.trim())) {
                insideAutoGenerated = true;
                mergedLines.add(line);
                continue;
            } else if (insideAutoGenerated && line.trim().isEmpty()) {
                insideAutoGenerated = false;
                mergedLines.add(line);
                continue;
            }

            if (beforeFirstKey && (isCommented.apply(line) || line.trim().isEmpty())) {
                // Handle top comments and empty lines before the first key.
                mergedLines.add(line);
                continue;
            }

            if (!key.isEmpty()) beforeFirstKey = false;

            if (userKeys.contains(key)) {
                // If user has any version (commented or uncommented) of this key, skip the
                // template line
                Optional<String> userValue =
                        userLines.stream()
                                .filter(
                                        l ->
                                                extractKey.apply(l).equalsIgnoreCase(key)
                                                        && !isCommented.apply(l))
                                .findFirst();
                if (userValue.isPresent()) mergedLines.add(userValue.get());
                continue;
            }

            if (isCommented.apply(line) || line.trim().isEmpty() || !userKeys.contains(key)) {
                mergedLines.add(
                        line); // If line is commented, empty or key not present in user's file,
                // retain the
                // template line
                continue;
            }
        }

        // Add any additional uncommented user lines that are not present in the
        // template
        for (String userLine : userLines) {
            String userKey = extractKey.apply(userLine);
            boolean isPresentInTemplate =
                    templateLines.stream()
                            .map(extractKey)
                            .anyMatch(templateKey -> templateKey.equalsIgnoreCase(userKey));
            if (!isPresentInTemplate && !isCommented.apply(userLine)) {
                if (!childOfTemplateEntry(
                        isCommented,
                        extractKey,
                        getIndentationLevel,
                        userLines,
                        userLine,
                        templateLines)) {
                    // check if userLine is a child of a entry within templateLines or not, if child
                    // of parent in templateLines then dont add to mergedLines, if anything else
                    // then add
                    mergedLines.add(userLine);
                }
            }
        }

        Files.write(outputPath, mergedLines, StandardCharsets.UTF_8);
    }

    // New method to check if a userLine is a child of an entry in templateLines
    boolean childOfTemplateEntry(
            Function<String, Boolean> isCommented,
            Function<String, String> extractKey,
            Function<String, Integer> getIndentationLevel,
            List<String> userLines,
            String userLine,
            List<String> templateLines) {
        String userKey = extractKey.apply(userLine).trim();
        int userIndentation = getIndentationLevel.apply(userLine);

        // Start by assuming the line is not a child of an entry in templateLines
        boolean isChild = false;

        // Iterate backwards through userLines from the current line to find any parent
        for (int i = userLines.indexOf(userLine) - 1; i >= 0; i--) {
            String potentialParentLine = userLines.get(i);
            int parentIndentation = getIndentationLevel.apply(potentialParentLine);

            // Check if we've reached a potential parent based on indentation
            if (parentIndentation < userIndentation) {
                String parentKey = extractKey.apply(potentialParentLine).trim();

                // Now, check if this potential parent or any of its parents exist in templateLines
                boolean parentExistsInTemplate =
                        templateLines.stream()
                                .filter(line -> !isCommented.apply(line)) // Skip commented lines
                                .anyMatch(
                                        templateLine -> {
                                            String templateKey =
                                                    extractKey.apply(templateLine).trim();
                                            return parentKey.equalsIgnoreCase(templateKey);
                                        });

                if (!parentExistsInTemplate) {
                    // If the parent does not exist in template, check the next level parent
                    userIndentation =
                            parentIndentation; // Update userIndentation to the parent's indentation
                    // for next iteration
                    if (parentIndentation == 0) {
                        // If we've reached the top-level parent and it's not in template, the
                        // original line is considered not a child
                        isChild = false;
                        break;
                    }
                } else {
                    // If any parent exists in template, the original line is considered a child
                    isChild = true;
                    break;
                }
            }
        }

        return isChild; // Return true if the line is not a child of any entry in templateLines
    }
}
