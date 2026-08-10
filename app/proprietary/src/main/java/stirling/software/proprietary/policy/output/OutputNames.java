package stirling.software.proprietary.policy.output;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import org.apache.commons.io.FilenameUtils;

/** Output file naming shared by the sinks: sanitised base names and collision suffixes. */
final class OutputNames {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HHmmss");

    private OutputNames() {}

    /**
     * Rename an output according to a pattern of {@code {filename}} (the produced name without its
     * extension), {@code {date}} and {@code {time}}. The produced extension is appended unless the
     * pattern already supplies one, and the result is re-sanitised so a pattern cannot introduce a
     * path separator. A blank pattern, or one that yields nothing, leaves the name untouched.
     */
    static String applyPattern(String pattern, String filename, int index, LocalDateTime now) {
        if (pattern == null || pattern.isBlank()) {
            return filename;
        }
        String extension = FilenameUtils.getExtension(filename);
        String expanded =
                pattern.replace("{filename}", FilenameUtils.getBaseName(filename))
                        .replace("{date}", now.format(DATE))
                        .replace("{time}", now.format(TIME));
        if (!extension.isEmpty() && FilenameUtils.getExtension(expanded).isEmpty()) {
            expanded = expanded + "." + extension;
        }
        String safe = safeName(expanded, index);
        return safe.isBlank() ? filename : safe;
    }

    /** Strip any directory component / "../" so a crafted output name cannot escape the target. */
    static String safeName(String filename, int index) {
        if (filename == null || filename.isBlank()) {
            return "output-" + index;
        }
        String name = FilenameUtils.getName(filename);
        if (name.isBlank() || ".".equals(name) || "..".equals(name)) {
            return "output-" + index;
        }
        return name;
    }

    /** The nth alternative for a taken name, appending " (n)" before the extension. */
    static String numbered(String filename, int n) {
        String base = FilenameUtils.getBaseName(filename);
        String ext = FilenameUtils.getExtension(filename);
        String suffix = ext.isEmpty() ? "" : "." + ext;
        return base + " (" + n + ")" + suffix;
    }
}
