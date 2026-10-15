package stirling.software.SPDF.controller.api;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import stirling.software.common.util.RegexPatternUtils;

/**
 * Zip entry names for the documents a split produces, from an optional list of user-supplied names.
 * Every name is safe to extract on Windows, macOS and Linux, and the names are unique ignoring case
 * so a case-insensitive filesystem cannot overwrite one document with another.
 */
final class SplitOutputNames {

    /** Leaves room for a de-duplication suffix and ".pdf" under the common 255-byte limit. */
    static final int MAX_NAME_BYTES = 200;

    private static final String PDF_EXTENSION = ".pdf";
    private static final Pattern CONTROL_CHARACTERS = Pattern.compile("[\\p{Cc}\\p{Zl}\\p{Zp}]");
    private static final Pattern LEADING_DOTS_AND_SPACES = Pattern.compile("^[.\\s\\p{Z}]+");
    private static final Pattern TRAILING_DOTS_AND_SPACES = Pattern.compile("[.\\s\\p{Z}]+$");
    private static final Pattern WINDOWS_RESERVED_STEM =
            Pattern.compile("(?i)^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\\.|$)");

    private SplitOutputNames() {}

    /**
     * One entry name ending in ".pdf" per document. Line {@code N} of {@code outputNames} names
     * document {@code N}; a blank line, a line with nothing usable after sanitising, or a document
     * past the end of the list gets {@code baseFilename_N}. A user's name keeps its exact form, so
     * when a default or a repeated name collides with it, the other one takes the {@code _2},
     * {@code _3}... suffix.
     */
    static List<String> resolve(String outputNames, String baseFilename, int count) {
        List<String> customNames = parseLines(outputNames);
        Set<String> claimedByUser = new HashSet<>();
        for (String name : customNames.subList(0, Math.min(count, customNames.size()))) {
            if (!name.isEmpty()) {
                claimedByUser.add(key(name));
            }
        }

        Set<String> used = new HashSet<>();
        List<String> entryNames = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            String custom = i < customNames.size() ? customNames.get(i) : "";
            boolean isCustom = !custom.isEmpty();
            String name = isCustom ? custom : baseFilename + "_" + (i + 1);
            String unique = name;
            if (used.contains(key(name)) || (!isCustom && claimedByUser.contains(key(name)))) {
                int suffix = 2;
                do {
                    unique = name + "_" + suffix++;
                } while (used.contains(key(unique)) || claimedByUser.contains(key(unique)));
            }
            used.add(key(unique));
            entryNames.add(unique + PDF_EXTENSION);
        }
        return entryNames;
    }

    /**
     * A user-typed line as a file name without extension, or "" when nothing usable remains.
     * Leading dots are dropped so a name cannot become a hidden file or "." / "..".
     */
    static String sanitize(String line) {
        String name = CONTROL_CHARACTERS.matcher(line).replaceAll("");
        name =
                RegexPatternUtils.getInstance()
                        .getSafeFilenamePattern()
                        .matcher(name)
                        .replaceAll("_");
        name = stripTrailingExtension(name);
        name = LEADING_DOTS_AND_SPACES.matcher(name).replaceAll("");
        name = stripTrailingExtension(truncateToUtf8Bytes(name, MAX_NAME_BYTES));
        return WINDOWS_RESERVED_STEM.matcher(name).replaceFirst("$1_");
    }

    /**
     * Drops every trailing ".pdf" along with trailing dots and spaces: Windows strips the latter on
     * extraction, so "a." and "a" would collide there.
     */
    private static String stripTrailingExtension(String name) {
        String stripped = TRAILING_DOTS_AND_SPACES.matcher(name).replaceAll("");
        while (stripped.regionMatches(
                true,
                stripped.length() - PDF_EXTENSION.length(),
                PDF_EXTENSION,
                0,
                PDF_EXTENSION.length())) {
            stripped =
                    TRAILING_DOTS_AND_SPACES
                            .matcher(
                                    stripped.substring(
                                            0, stripped.length() - PDF_EXTENSION.length()))
                            .replaceAll("");
        }
        return stripped;
    }

    private static List<String> parseLines(String outputNames) {
        if (outputNames == null || outputNames.isBlank()) {
            return List.of();
        }
        List<String> names = new ArrayList<>();
        for (String line :
                RegexPatternUtils.getInstance().getMultiFormatNewlinePattern().split(outputNames)) {
            names.add(sanitize(line));
        }
        return names;
    }

    private static String truncateToUtf8Bytes(String name, int maxBytes) {
        int bytes = 0;
        int end = 0;
        while (end < name.length()) {
            int codePoint = name.codePointAt(end);
            int width = codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
            if (bytes + width > maxBytes) {
                break;
            }
            bytes += width;
            end += Character.charCount(codePoint);
        }
        return name.substring(0, end);
    }

    private static String key(String name) {
        return name.toLowerCase(Locale.ROOT);
    }
}
