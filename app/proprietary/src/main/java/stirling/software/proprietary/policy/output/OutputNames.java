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
     * Rename an output by a pattern of {@code {filename}}, {@code {date}} and {@code {time}}. The
     * extension is appended unless the pattern supplies one; the result is re-sanitised.
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
        // Read off the pattern, not the expanded name: a dotted base name such as
        // "invoice.2026.pdf" otherwise looks like it already carries an extension.
        if (!extension.isEmpty() && !patternSuppliesExtension(pattern)) {
            expanded = expanded + "." + extension;
        }
        return safeName(expanded, index);
    }

    private static boolean patternSuppliesExtension(String pattern) {
        String literal =
                pattern.replace("{filename}", "").replace("{date}", "").replace("{time}", "");
        return !FilenameUtils.getExtension(literal).isEmpty();
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
