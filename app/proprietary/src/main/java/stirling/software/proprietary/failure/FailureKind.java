package stirling.software.proprietary.failure;

import static stirling.software.proprietary.failure.FailureActionId.ACKNOWLEDGE;
import static stirling.software.proprietary.failure.FailureActionId.DISMISS;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import lombok.AccessLevel;
import lombok.Getter;

/**
 * The registry of failure kinds, described as data: a stable id, i18n keys and an English fallback
 * like {@code ExceptionUtils.ErrorCode}, plus the facets a review surface needs.
 *
 * <p>Actions are declared here but implemented in {@link FailureAction} beans resolved by id, so a
 * new kind ships as a registry entry plus copy. Two members today: {@link #UNKNOWN} gives every
 * failed run a record, and kinds get promoted out of it as production shows what occurs.
 */
@Getter
public enum FailureKind {
    INPUT_PASSWORD_PROTECTED(
            Stage.INPUT,
            Severity.ERROR,
            Remedy.NEEDS_USER_INPUT,
            Scope.FILE,
            errorCodes("E004"),
            fallback("This document is password-protected, so the pipeline could not read it."),
            offer(ACKNOWLEDGE, "acknowledgeUnlock"),
            offer(DISMISS, "dismissSkipFile")),

    UNKNOWN(
            Stage.INTERNAL,
            Severity.ERROR,
            Remedy.PERMANENT,
            Scope.RUN,
            noErrorCodes(),
            fallback("This run failed for a reason Stirling does not yet recognise."),
            offer(ACKNOWLEDGE),
            offer(DISMISS));

    private static final String KEY_PREFIX = "portal.failures.kind.";
    private static final String ACTION_KEY_PREFIX = "portal.failures.action.";

    private final Stage stage;
    private final Severity severity;
    private final Remedy remedy;
    private final Scope scope;

    /** English fallback, used when the client has no translation for {@link #getTitleKey()}. */
    private final String defaultTitle;

    /** Codes from {@code ExceptionUtils.ErrorCode} that map onto this kind; may be empty. */
    private final List<String> errorCodes;

    /**
     * What the review surface may offer, in display order. Never empty. No generated accessor,
     * because {@link Offer} is private; read via {@link #getActions()} or {@link #labelKeyFor}.
     */
    @Getter(AccessLevel.NONE)
    private final List<Offer> offers;

    FailureKind(
            Stage stage,
            Severity severity,
            Remedy remedy,
            Scope scope,
            List<String> errorCodes,
            String defaultTitle,
            Offer... offers) {
        this.stage = stage;
        this.severity = severity;
        this.remedy = remedy;
        this.scope = scope;
        this.errorCodes = List.copyOf(errorCodes);
        this.defaultTitle = defaultTitle;
        this.offers = List.of(offers);
    }

    /**
     * One action this kind offers, with the key to label it by. One ordered list rather than ids
     * plus a parallel map of overrides, which could disagree with each other.
     *
     * @param labelKeySuffix key under {@code portal.failures.action.}, or null for the generic
     *     label
     */
    private record Offer(FailureActionId id, String labelKeySuffix) {}

    /** An action labelled by this kind's own wording, where the generic label reads badly. */
    private static Offer offer(FailureActionId id, String labelKeySuffix) {
        return new Offer(id, labelKeySuffix);
    }

    /** An action labelled by the shared wording for that action. */
    private static Offer offer(FailureActionId id) {
        return new Offer(id, null);
    }

    /**
     * The {@code ErrorCode}s this kind claims. Java has no named arguments, so these factories
     * exist to label the two constructor arguments whose types do not already name themselves.
     */
    private static List<String> errorCodes(String... codes) {
        return List.of(codes);
    }

    /** Claims no {@code ErrorCode}: reached only through the classifier's fallback. */
    private static List<String> noErrorCodes() {
        return List.of();
    }

    /** The English text shown when the client has no translation for this kind. */
    private static String fallback(String englishTitle) {
        return englishTitle;
    }

    /** Stable wire id. Never renamed once shipped: persisted rows reference it. */
    public String getId() {
        return name();
    }

    public String getTitleKey() {
        return KEY_PREFIX + lowerCamelId() + ".title";
    }

    public String getDescriptionKey() {
        return KEY_PREFIX + lowerCamelId() + ".description";
    }

    /** The actions this kind offers, in display order. */
    public List<FailureActionId> getActions() {
        return offers.stream().map(Offer::id).toList();
    }

    /** Whether this kind offers {@code action}. The dispatch guard: see {@code FailureActionId}. */
    public boolean declares(FailureActionId action) {
        return offers.stream().anyMatch(offer -> offer.id() == action);
    }

    /** The label key for {@code action}: this kind's own wording, else the generic one. */
    public String labelKeyFor(FailureActionId action) {
        return offers.stream()
                .filter(offer -> offer.id() == action && offer.labelKeySuffix() != null)
                .map(offer -> ACTION_KEY_PREFIX + offer.labelKeySuffix())
                .findFirst()
                .orElseGet(() -> genericLabelKey(action));
    }

    /** The label key used when a kind supplies no wording of its own. */
    static String genericLabelKey(FailureActionId action) {
        return ACTION_KEY_PREFIX + toLowerCamel(action.name());
    }

    /**
     * Lookup by wire id. Empty rather than throwing: ids arrive from persisted rows and clients.
     */
    public static Optional<FailureKind> byId(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        return Arrays.stream(values()).filter(kind -> kind.name().equals(id)).findFirst();
    }

    /** The kind claiming {@code errorCode}, if any. Empty for a code no kind has adopted yet. */
    public static Optional<FailureKind> byErrorCode(String errorCode) {
        if (errorCode == null || errorCode.isBlank()) {
            return Optional.empty();
        }
        return Arrays.stream(values())
                .filter(kind -> kind.errorCodes.contains(errorCode))
                .findFirst();
    }

    private String lowerCamelId() {
        return toLowerCamel(name());
    }

    /**
     * {@code INPUT_PASSWORD_PROTECTED} to {@code inputPasswordProtected}, for i18n key building.
     */
    private static String toLowerCamel(String screamingSnake) {
        String[] parts = screamingSnake.toLowerCase(java.util.Locale.ROOT).split("_");
        StringBuilder out = new StringBuilder(parts[0]);
        for (int i = 1; i < parts.length; i++) {
            if (parts[i].isEmpty()) {
                continue;
            }
            out.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
        }
        return out.toString();
    }

    // ── Facets ──────────────────────────────────────────────────────────────
    // Nested because each describes a FailureKind and is never a concept on its own.

    /**
     * Where in a run's life the failure happened: reading the document ({@code INPUT}), a tool step
     * or the engine ({@code INTERNAL}), delivery ({@code OUTPUT}), a gate refusing it ({@code
     * BLOCKED}), or never admitted ({@code NEVER_RAN}).
     *
     * <p>All five declared up front so a later kind needs no enum change, which would strand the
     * value already snapshotted on existing rows.
     */
    public enum Stage {
        INPUT,
        INTERNAL,
        OUTPUT,
        BLOCKED,
        NEVER_RAN
    }

    /** How loudly a failure kind should be surfaced. */
    public enum Severity {
        ERROR,
        WARNING,
        INFO
    }

    /**
     * What intervention would clear this failure. Advisory metadata for the review surface; nothing
     * branches on it server-side yet.
     */
    public enum Remedy {
        TRANSIENT,
        NEEDS_USER_INPUT,
        NEEDS_FILE_FIX,
        NEEDS_CONFIG_FIX,
        NEEDS_SERVER_FIX,
        PERMANENT
    }

    /**
     * What the failure is about, which is what the dedup key groups repeats by: one file, run,
     * policy, source, or the whole server.
     */
    public enum Scope {
        FILE,
        RUN,
        POLICY,
        SOURCE,
        SERVER
    }
}
