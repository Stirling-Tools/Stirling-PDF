package stirling.software.proprietary.failure;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

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

    /** Upper bound on a stored message, so one enormous stack trace cannot fill the column. */
    private static final int MAX_DETAIL_LENGTH = 2_000;

    public RecordFailure {
        if (kind == null) {
            throw new IllegalArgumentException("kind is required");
        }
        if (origin == null) {
            throw new IllegalArgumentException("origin is required");
        }
        // Capped here rather than at each call site, since this record is the only way a row is
        // written, and an unclassified failure carries a raw message of unbounded length. Stored
        // verbatim otherwise: it is the user's own error about their own file, and hiding parts of
        // it makes the row harder to act on without making it meaningfully safer.
        detail = truncate(detail);
    }

    /**
     * A processor-side run failure. {@code sourceId} says which folder, bucket or webhook fed the
     * run, and is the only attribution an unattended failure has: there is no user to name. {@code
     * fileId} is the source's opaque reference to the document, already hashed upstream.
     */
    public static RecordFailure forRun(
            FailureKind kind,
            Long teamId,
            String actor,
            String policyId,
            String runId,
            String sourceId,
            String fileId,
            String detail) {
        return new RecordFailure(
                kind,
                FailureOrigin.POLICY,
                teamId,
                actor,
                policyId,
                runId,
                sourceId,
                fileId,
                detail);
    }

    /**
     * A failure a user hit in their own editor. There is no policy, run or source: the user is the
     * attribution, and {@code fileId} may be null when the report named no file.
     */
    public static RecordFailure forEditor(
            FailureKind kind, Long teamId, String actor, String fileId, String detail) {
        return new RecordFailure(
                kind, FailureOrigin.TOOL, teamId, actor, null, null, null, fileId, detail);
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
