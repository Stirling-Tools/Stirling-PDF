package stirling.software.SPDF.utils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import stirling.software.SPDF.model.api.SplitOutputNamingRequest;
import stirling.software.common.util.RegexPatternUtils;

/**
 * Zip entry names for the documents a split produces, from an optional naming pattern and an
 * optional list of user-supplied names, handed out one document at a time. Every name is safe to
 * extract on Windows, macOS and Linux, and the names are unique ignoring case so a case-insensitive
 * filesystem cannot overwrite one document with another.
 */
public final class SplitOutputNames {

    /** Replaced by the 1-based document number in a naming pattern. */
    public static final String NUMBER_TOKEN = "{n}";

    /** Leaves room for a de-duplication suffix and ".pdf" under the common 255-byte limit. */
    static final int MAX_NAME_BYTES = 200;

    private static final String PDF_EXTENSION = ".pdf";
    private static final Pattern CONTROL_CHARACTERS = Pattern.compile("[\\p{Cc}\\p{Zl}\\p{Zp}]");

    /** Same characters as {@code RegexPatternUtils#getSafeFilenamePattern}. */
    private static final String ILLEGAL_CHAR = "[/\\\\?%*:|\"<>]";

    /** "Report / Summary": the run and one space after it go, leaving "Report Summary". */
    private static final String ILLEGAL_RUN_AFTER_SPACE = "(?<=\\s)" + ILLEGAL_CHAR + "+\\s?";

    /**
     * "Chapter: 1": the run goes, leaving "Chapter 1". The {@code (?<!...)} guard lets a match
     * start only on a run's first character. Without it the engine retries from every character of
     * a run with no space after it, which is quadratic on long user input.
     */
    private static final String ILLEGAL_RUN_BEFORE_SPACE =
            "(?<!" + ILLEGAL_CHAR + ")" + ILLEGAL_CHAR + "+(?=\\s)";

    /**
     * A run of illegal characters touching whitespace is dropped rather than turned into "_", so
     * the name reads as typed. Must stay in sync with splitOutputNamePattern.ts, which previews
     * these names in the browser.
     */
    private static final Pattern ILLEGAL_RUN_TOUCHING_SPACE =
            Pattern.compile(ILLEGAL_RUN_AFTER_SPACE + "|" + ILLEGAL_RUN_BEFORE_SPACE);

    private static final Pattern LEADING_DOTS_AND_SPACES = Pattern.compile("^[.\\s\\p{Z}]+");
    private static final Pattern WINDOWS_RESERVED_STEM =
            Pattern.compile("(?i)^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\\.|$)");

    private final List<String> customNames;
    private final String namePattern;
    private final Set<String> claimedByUser = new HashSet<>();
    private final Set<String> used = new HashSet<>();
    private int position;

    /** Names for the {@code count} documents a split of {@code request} produces. */
    public static SplitOutputNames forRequest(SplitOutputNamingRequest request, int count) {
        return new SplitOutputNames(
                request.getOutputNames(), request.getOutputNamePattern(), count);
    }

    SplitOutputNames(String outputNames, String namePattern, int count) {
        this.customNames = parseLines(outputNames);
        this.namePattern = namePattern;
        for (String name : customNames.subList(0, Math.min(count, customNames.size()))) {
            if (!name.isEmpty()) {
                claimedByUser.add(key(name));
            }
        }
    }

    /**
     * Entry name ending in ".pdf" for the next document; call once per document, in output order.
     * Line {@code N} of {@code outputNames} names document {@code N}. A blank line, a line with
     * nothing usable after sanitising, or a document past the end of the list gets {@code
     * namePattern} with {@link #NUMBER_TOKEN} replaced by {@code N} (or {@code N} appended when the
     * token is absent), else {@code defaultStem} as given. A user's name keeps its exact form, so
     * when another name collides with it, the other one takes the {@code _2}, {@code _3}... suffix.
     * Not thread-safe.
     */
    public String next(String defaultStem) {
        int index = position++;
        String custom = index < customNames.size() ? customNames.get(index) : "";
        boolean isCustom = !custom.isEmpty();
        String name = isCustom ? custom : defaultName(defaultStem, index + 1);
        String unique = name;
        if (used.contains(key(name)) || (!isCustom && claimedByUser.contains(key(name)))) {
            int suffix = 2;
            do {
                unique = name + "_" + suffix++;
            } while (used.contains(key(unique)) || claimedByUser.contains(key(unique)));
        }
        used.add(key(unique));
        return unique + PDF_EXTENSION;
    }

    /**
     * A user-typed line as a file name without extension, or "" when nothing usable remains.
     * Leading dots are dropped so a name cannot become a hidden file or "." / "..".
     */
    static String sanitize(String line) {
        String name = CONTROL_CHARACTERS.matcher(line).replaceAll("");
        name = ILLEGAL_RUN_TOUCHING_SPACE.matcher(name).replaceAll("");
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
     * Drops trailing dots and spaces with a linear scan: the equivalent {@code [.\\s\\p{Z}]+$}
     * regex goes quadratic on long trailing runs, and this runs on the full user-supplied line
     * before any length cap.
     */
    static String stripTrailingDotsAndSpaces(String name) {
        int end = name.length();
        while (end > 0) {
            int codePoint = name.codePointBefore(end);
            if (codePoint != '.'
                    && !Character.isWhitespace(codePoint)
                    && !Character.isSpaceChar(codePoint)) {
                break;
            }
            end -= Character.charCount(codePoint);
        }
        return name.substring(0, end);
    }

    /**
     * Drops every trailing ".pdf" along with trailing dots and spaces: Windows strips the latter on
     * extraction, so "a." and "a" would collide there.
     */
    private static String stripTrailingExtension(String name) {
        String stripped = stripTrailingDotsAndSpaces(name);
        while (stripped.regionMatches(
                true,
                stripped.length() - PDF_EXTENSION.length(),
                PDF_EXTENSION,
                0,
                PDF_EXTENSION.length())) {
            stripped =
                    stripTrailingDotsAndSpaces(
                            stripped.substring(0, stripped.length() - PDF_EXTENSION.length()));
        }
        return stripped;
    }

    private String defaultName(String defaultStem, int number) {
        if (namePattern != null && !namePattern.isBlank()) {
            String numbered =
                    namePattern.contains(NUMBER_TOKEN)
                            ? namePattern.replace(NUMBER_TOKEN, String.valueOf(number))
                            : namePattern.strip() + " " + number;
            String name = sanitize(numbered);
            if (!name.isEmpty()) {
                return name;
            }
        }
        return defaultStem;
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
