package stirling.software.common.util;

import java.util.regex.Pattern;

/**
 * Removes anything shaped like a file name from free text, so a document's name is not persisted or
 * logged alongside whatever went wrong with it.
 *
 * <p>Best-effort by nature: this reads prose written elsewhere and guesses. Somewhere that can
 * avoid holding the name at all should do that instead and treat this as the backstop.
 */
public final class FilenameRedaction {

    /** What a redacted name is replaced with. Recognisable, and short enough not to bloat a row. */
    public static final String PLACEHOLDER = "<file>";

    /**
     * Name characters ending in one to three short extensions. Matched by shape, so a newly
     * supported format needs no maintenance here.
     *
     * <p>Spaces are crossed only when the name is delimited by a quote, bracket or path separator:
     * an undelimited one cannot be told from the sentence around it, and swallowing the sentence
     * costs more than it saves. An all-digit extension is not one, which keeps {@code v2.14.2}
     * intact, and the lookarounds keep it off dotted identifiers so {@code java.lang.Foo} survives
     * a stack trace.
     */
    private static final Pattern FILE_NAME =
            Pattern.compile(
                    "(?<![\\w.])(?:(?<=[\"'(\\[/\\\\])[\\p{L}\\p{N}_%+&'()\\[\\]\\-]+"
                            + "(?:[ ][\\p{L}\\p{N}_%+&'()\\[\\]\\-]+){0,6}"
                            + "|[\\p{L}\\p{N}_%+&'()\\[\\]\\-]+)"
                            + "(?:\\.(?![0-9]+(?:\\b|\\.))[\\p{L}\\p{N}]{1,8}){1,3}(?![\\w.])",
                    Pattern.UNICODE_CHARACTER_CLASS);

    private FilenameRedaction() {}

    /**
     * {@code text} with every file name replaced by {@link #PLACEHOLDER}. Null in, null out, so a
     * caller with nothing to redact needs no branch of its own.
     *
     * <p>Best-effort: see the class note. Exactly what is and is not caught is pinned by {@code
     * FilenameRedactionTest}.
     */
    public static String attemptRedaction(String text) {
        return text == null ? null : FILE_NAME.matcher(text).replaceAll(PLACEHOLDER);
    }
}
