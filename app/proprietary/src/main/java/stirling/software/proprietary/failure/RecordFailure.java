package stirling.software.proprietary.failure;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.regex.Pattern;

/**
 * Everything needed to record one failure. Every reference field is nullable, because a failure can
 * happen before a file or policy is known and with no user at all (a trigger-fired run on a
 * login-disabled deployment). Only {@code kind} and {@code origin} are required.
 */
public record RecordFailure(
        FailureKind kind,
        FailureOrigin origin,
        Long teamId,
        String actor,
        String policyId,
        String runId,
        String sourceId,
        String fileId,
        String detail) {

    /**
     * Anything shaped like a file name: a run of name characters ending in one to three short
     * extensions. Matched by shape rather than an extension allowlist, so a newly supported format
     * needs no maintenance here.
     *
     * <p>Covers what document names actually look like: brackets, {@code %} escapes, ampersands and
     * apostrophes, non-ASCII scripts, and stacked extensions such as {@code .tar.gz}.
     *
     * <p>Spaces are only crossed when the name is delimited, by a quote, an opening bracket or a
     * path separator. An undelimited spaced name is indistinguishable from the sentence around it,
     * so {@code Failed on Q3 Layoff List.pdf} keeps its leading words rather than have the whole
     * message swallowed. That is the deliberate limit of this pass.
     *
     * <p>An extension that is all digits is not one, which keeps version strings like {@code
     * v2.14.2} intact, and the surrounding lookarounds keep it off dotted identifiers so {@code
     * java.lang.Foo} survives a stack trace. Known cost: {@code Foo.java:120} becomes {@code
     * <file>:120}.
     *
     * <p>Best-effort even so. The engine's own messages never include a name; this only tidies what
     * downstream tools embed.
     */
    private static final Pattern FILE_PATH_OR_NAME =
            Pattern.compile(
                    "(?<![\\w.])(?:(?<=[\"'(\\[/\\\\])[\\p{L}\\p{N}_%+&'()\\[\\]\\-]+"
                            + "(?:[ ][\\p{L}\\p{N}_%+&'()\\[\\]\\-]+){0,6}"
                            + "|[\\p{L}\\p{N}_%+&'()\\[\\]\\-]+)"
                            + "(?:\\.(?![0-9]+(?:\\b|\\.))[\\p{L}\\p{N}]{1,8}){1,3}(?![\\w.])",
                    Pattern.UNICODE_CHARACTER_CLASS);

    /** Upper bound on a stored message, so one enormous stack trace cannot fill the column. */
    private static final int MAX_DETAIL_LENGTH = 2_000;

    public RecordFailure {
        if (kind == null) {
            throw new IllegalArgumentException("kind is required");
        }
        if (origin == null) {
            throw new IllegalArgumentException("origin is required");
        }
        // Sanitised here rather than at each call site, since this record is the only way a row is
        // written. Capped too: an unclassified failure carries a raw message of unbounded length.
        detail = truncate(withoutFileNames(detail));
    }

    /** A processor-side failure with no file or source context, e.g. a run that failed outright. */
    public static RecordFailure forRun(
            FailureKind kind,
            Long teamId,
            String actor,
            String policyId,
            String runId,
            String fileId,
            String detail) {
        return new RecordFailure(
                kind, FailureOrigin.POLICY, teamId, actor, policyId, runId, null, fileId, detail);
    }

    /**
     * What this failure is about, per the row's scope. Two failures sharing a kind and a scope
     * reference are the same incident; see {@link #dedupKey()}.
     */
    public String scopeRef() {
        return switch (kind.getScope()) {
            case FILE -> nullToEmpty(policyId) + "|" + fileOrRun();
            case RUN -> nullToEmpty(runId);
            case POLICY -> nullToEmpty(policyId);
            case SOURCE -> nullToEmpty(sourceId);
            // One server-wide condition is one incident regardless of which run tripped over it.
            case SERVER -> "";
        };
    }

    /**
     * The file this failure is about, or the run when the producer could not name one. Without the
     * fallback, every file failing the same way under one policy shares a scope reference, and the
     * second onwards folds into the first as though one document had failed repeatedly.
     *
     * <p>Prefixed so a file id and a run id cannot collide.
     */
    private String fileOrRun() {
        return isBlank(fileId) ? "run:" + nullToEmpty(runId) : "file:" + fileId;
    }

    /**
     * Decides whether this failure repeats an existing incident: SHA-256 of {@code
     * kindId|scope|scopeRef}. Hashed so a long scope reference (an S3 key) fits a fixed-width
     * index, and deterministic so two nodes converge on one incident. Every input is an enum name
     * or an id.
     */
    public String dedupKey() {
        String raw = kind.getId() + "|" + kind.getScope().name() + "|" + scopeRef();
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the JDK; unreachable outside a broken runtime.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /**
     * Strip file paths and names out of a failure message. The engine's own messages already omit
     * them; a message forwarded from a downstream tool is outside this package's control.
     */
    private static String withoutFileNames(String detail) {
        return detail == null ? null : FILE_PATH_OR_NAME.matcher(detail).replaceAll("<file>");
    }

    private static String truncate(String detail) {
        if (detail == null || detail.length() <= MAX_DETAIL_LENGTH) {
            return detail;
        }
        // Leave room for the ellipsis so the cap is the cap, and step back once more rather than
        // cutting between the halves of a surrogate pair, which would store invalid UTF-16.
        int end = MAX_DETAIL_LENGTH - 1;
        if (Character.isHighSurrogate(detail.charAt(end - 1))) {
            end--;
        }
        return detail.substring(0, end) + "…";
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
