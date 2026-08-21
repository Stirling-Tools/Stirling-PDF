package stirling.software.proprietary.policy.output;

import org.apache.commons.io.FilenameUtils;

/** Output file naming shared by the sinks: sanitised base names and collision suffixes. */
final class OutputNames {

    private OutputNames() {}

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
