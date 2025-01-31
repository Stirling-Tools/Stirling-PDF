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
import java.util.*;

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
            Path settingsPath = Paths.get(InstallationPathConfig.getSettingsPath());
            URL templateResource = getClass().getClassLoader().getResource("settings.yml.template");
            if (templateResource == null) {
                throw new IOException("Resource not found: settings.yml.template");
            }

            // Copy template to a temp location so we can read lines
            Path tempTemplatePath = Files.createTempFile("settings.yml", ".template");
            try (InputStream in = templateResource.openStream()) {
                Files.copy(in, tempTemplatePath, StandardCopyOption.REPLACE_EXISTING);
            }

            // 2a) Read lines from both files
            List<String> templateLines = Files.readAllLines(tempTemplatePath);
            List<String> mainLines = Files.readAllLines(settingsPath);

            // 2b) Merge lines
            List<String> mergedLines = mergeYamlLinesWithTemplate(templateLines, mainLines);

            // 2c) Only write if there's an actual difference
            if (!mergedLines.equals(mainLines)) {
                Files.write(settingsPath, mergedLines);
                log.info("Settings file updated based on template changes.");
            } else {
                log.info("No changes detected; settings file left as-is.");
            }

            Files.deleteIfExists(tempTemplatePath);
        }

        // 3) Ensure custom settings file exists
        Path customSettingsPath = Paths.get(InstallationPathConfig.getCustomSettingsPath());
        if (!Files.exists(customSettingsPath)) {
            Files.createFile(customSettingsPath);
        }
    }

    /**
     * Merge logic that: - Reads the template lines block-by-block (where a "block" = a key and all
     * the lines that belong to it), - If the main file has that key, we keep the main file's block
     * (preserving whitespace + inline comments). - Otherwise, we insert the template's block. - We
     * also remove keys from main that no longer exist in the template.
     *
     * @param templateLines lines from settings.yml.template
     * @param mainLines lines from the existing settings.yml
     * @return merged lines
     */
    private List<String> mergeYamlLinesWithTemplate(
            List<String> templateLines, List<String> mainLines) {

        // 1) Parse template lines into an ordered map: path -> Block
        LinkedHashMap<String, Block> templateBlocks = parseYamlBlocks(templateLines);

        // 2) Parse main lines into a map: path -> Block
        LinkedHashMap<String, Block> mainBlocks = parseYamlBlocks(mainLines);

        // 3) Build the final list by iterating template blocks in order
        List<String> merged = new ArrayList<>();
        for (Map.Entry<String, Block> entry : templateBlocks.entrySet()) {
            String path = entry.getKey();
            Block templateBlock = entry.getValue();

            if (mainBlocks.containsKey(path)) {
                // If main has the same block, prefer main's lines
                merged.addAll(mainBlocks.get(path).lines);
            } else {
                // Otherwise, add the template block
                merged.addAll(templateBlock.lines);
            }
        }

        return merged;
    }

    /**
     * Parse a list of lines into a map of "path -> Block" where "Block" is all lines that belong to
     * that key (including subsequent indented lines). Very naive approach that may not work with
     * advanced YAML.
     */
    private LinkedHashMap<String, Block> parseYamlBlocks(List<String> lines) {
        LinkedHashMap<String, Block> blocks = new LinkedHashMap<>();

        Block currentBlock = null;
        String currentPath = null;

        for (String line : lines) {
            if (isLikelyKeyLine(line)) {
                // Found a new "key: ..." line
                if (currentBlock != null && currentPath != null) {
                    blocks.put(currentPath, currentBlock);
                }
                currentBlock = new Block();
                currentBlock.lines.add(line);
                currentPath = computePathForLine(line);
            } else {
                // Continuation of current block (comments, blank lines, sub-lines)
                if (currentBlock == null) {
                    // If file starts with comments/blank lines, treat as "header block" with path
                    // ""
                    currentBlock = new Block();
                    currentPath = "";
                }
                currentBlock.lines.add(line);
            }
        }

        if (currentBlock != null && currentPath != null) {
            blocks.put(currentPath, currentBlock);
        }

        return blocks;
    }

    /**
     * Checks if the line is likely "key:" or "key: value", ignoring comments/blank. Skips lines
     * starting with "-" or "#".
     */
    private boolean isLikelyKeyLine(String line) {
        String trimmed = line.trim();
        if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("-")) {
            return false;
        }
        int colonIdx = trimmed.indexOf(':');
        return (colonIdx > 0); // someKey:
    }

    // For a line like "security: ", returns "security" or "security.enableLogin"
    // by looking at indentation. Very naive.
    private static final Deque<String> pathStack = new ArrayDeque<>();
    private static int currentIndentLevel = 0;

    private String computePathForLine(String line) {
        // count leading spaces
        int leadingSpaces = 0;
        for (char c : line.toCharArray()) {
            if (c == ' ') leadingSpaces++;
            else break;
        }
        // assume 2 spaces = 1 indent
        int indentLevel = leadingSpaces / 2;

        String trimmed = line.trim();
        int colonIdx = trimmed.indexOf(':');
        String keyName = trimmed.substring(0, colonIdx).trim();

        // pop stack until we match the new indent level
        while (currentIndentLevel >= indentLevel && !pathStack.isEmpty()) {
            pathStack.pop();
            currentIndentLevel--;
        }

        // push the new key
        pathStack.push(keyName);
        currentIndentLevel = indentLevel;

        // build path by reversing the stack
        String[] arr = pathStack.toArray(new String[0]);
        List<String> reversed = Arrays.asList(arr);
        Collections.reverse(reversed);
        return String.join(".", reversed);
    }

    /**
     * Simple holder for the lines that comprise a "block" (i.e. a key and its subsequent lines).
     */
    private static class Block {
        List<String> lines = new ArrayList<>();
    }
}
