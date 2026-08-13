package stirling.software.proprietary.failure;

import static stirling.software.proprietary.failure.FailureActionId.DECRYPT_AND_RETRY;
import static stirling.software.proprietary.failure.FailureActionId.DISMISS;
import static stirling.software.proprietary.failure.FailureActionId.RETRY;
import static stirling.software.proprietary.failure.FailureActionId.VIEW_FILE;
import static stirling.software.proprietary.failure.FailureActionId.VIEW_IN_PROCESSOR;
import static stirling.software.proprietary.failure.FailureAudience.ANYONE_WHO_SEES;
import static stirling.software.proprietary.failure.FailureAudience.OWNER;
import static stirling.software.proprietary.failure.FailureAudience.TEAM_REVIEWER;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

import lombok.AccessLevel;
import lombok.Getter;

/**
 * The registry of failure kinds, described as data: a stable id, i18n keys and an English fallback
 * like {@code ExceptionUtils.ErrorCode}, plus the facets a review surface needs.
 *
 * <p>Actions are declared here but run elsewhere: a server action in a {@link FailureAction} bean
 * resolved by id, a client action in the browser that holds the document. Either way a new kind
 * ships as a registry entry plus copy. Two members today: {@link #UNKNOWN} gives every failed run a
 * record, and kinds get promoted out of it as production shows what occurs.
 *
 * <p>Each offer also says who it is for, because the same incident is read by the person who hit it
 * and by whoever reviews after them: only the owner holds the document, only a reviewer wants the
 * run.
 */
@Getter
public enum FailureKind {
    INPUT_PASSWORD_PROTECTED(
            FailureStage.INPUT,
            FailureSeverity.ERROR,
            FailureRemedy.NEEDS_USER_INPUT,
            FailureScope.FILE,
            errorCodes("E004"),
            fallback("This document is password-protected, so the pipeline could not read it."),
            // The password is the fix and only the owner has it, so everyone else is
            // offered the run and a way to close the row.
            offer(DECRYPT_AND_RETRY, OWNER),
            offer(RETRY, OWNER),
            offer(VIEW_FILE, OWNER),
            offer(VIEW_IN_PROCESSOR, TEAM_REVIEWER),
            offer(DISMISS, ANYONE_WHO_SEES)),

    UNKNOWN(
            FailureStage.INTERNAL,
            FailureSeverity.ERROR,
            FailureRemedy.PERMANENT,
            FailureScope.RUN,
            noErrorCodes(),
            fallback("This run failed for a reason Stirling does not yet recognise."),
            // Nothing here is known to be fixable, but a plain retry is still worth offering: an
            // unrecognised failure is often a one-off.
            offer(RETRY, OWNER),
            offer(VIEW_IN_PROCESSOR, TEAM_REVIEWER),
            offer(VIEW_FILE, OWNER),
            offer(DISMISS, ANYONE_WHO_SEES));

    private static final String KEY_PREFIX = "portal.failures.kind.";
    private static final String ACTION_KEY_PREFIX = "portal.failures.action.";

    /**
     * Every claimed {@code ErrorCode}, to the kind claiming it. Indexed once rather than scanned
     * per lookup, so a duplicate cannot be resolved by declaration order without anyone noticing. A
     * duplicate is refused at boot; see {@link #duplicateErrorCodes()}.
     */
    private static final Map<String, FailureKind> BY_ERROR_CODE = indexErrorCodes();

    private final FailureStage stage;
    private final FailureSeverity severity;
    private final FailureRemedy remedy;
    private final FailureScope scope;

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
            FailureStage stage,
            FailureSeverity severity,
            FailureRemedy remedy,
            FailureScope scope,
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
     * One action this kind offers: who it is for, and the key to label it by. One ordered list
     * rather than ids plus parallel maps of audiences and label overrides, which could disagree
     * with each other.
     *
     * @param labelKeySuffix key under {@code portal.failures.action.}, or null for the generic
     *     label
     */
    private record Offer(FailureActionId id, FailureAudience audience, String labelKeySuffix) {}

    /**
     * An action this kind offers, for whoever can actually take it, labelled by the shared wording.
     * Declaration order is display order.
     */
    private static Offer offer(FailureActionId id, FailureAudience audience) {
        return new Offer(id, audience, null);
    }

    /**
     * As {@link #offer(FailureActionId, FailureAudience)}, but labelled by this kind's own wording
     * where the shared one reads badly.
     */
    private static Offer offer(
            FailureActionId id, FailureAudience audience, String labelKeySuffix) {
        return new Offer(id, audience, labelKeySuffix);
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

    /**
     * What this kind offers, in declaration order, each with its label resolved. What a review
     * surface reads, so it never has to ask two separate questions about one offer.
     */
    public List<OfferedAction> getOfferedActions() {
        return offers.stream()
                .map(
                        offer ->
                                new OfferedAction(
                                        offer.id(), labelKeyFor(offer.id()), offer.audience()))
                .toList();
    }

    /** One action as a kind declares it: what to call it and who it is for. */
    public record OfferedAction(FailureActionId id, String labelKey, FailureAudience audience) {}

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

    private static Map<String, FailureKind> indexErrorCodes() {
        Map<String, FailureKind> index = new HashMap<>();
        for (FailureKind kind : values()) {
            for (String code : kind.errorCodes) {
                index.putIfAbsent(code, kind);
            }
        }
        return Map.copyOf(index);
    }

    /**
     * Codes claimed by more than one kind, which would make classification depend on declaration
     * order. Empty in a well-formed registry.
     *
     * <p>Reported for a caller to act on rather than thrown from class init, where it would arrive
     * as an {@code ExceptionInInitializerError} blamed on whatever touched the enum first, then as
     * {@code NoClassDefFoundError} everywhere after. {@link FailureClassifier} refuses to start.
     */
    static List<String> duplicateErrorCodes() {
        return duplicatesIn(Arrays.stream(values()).flatMap(kind -> kind.errorCodes.stream()));
    }

    /**
     * The codes appearing more than once, first-seen order. Split out from the registry because the
     * registry is a closed enum: this is the only seam at which the detection itself can be shown
     * to find anything.
     */
    static List<String> duplicatesIn(Stream<String> codes) {
        Set<String> seen = new HashSet<>();
        return codes.filter(code -> !seen.add(code)).distinct().toList();
    }

    /** The kind claiming {@code errorCode}, if any. Empty for a code no kind has adopted yet. */
    public static Optional<FailureKind> byErrorCode(String errorCode) {
        if (errorCode == null || errorCode.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(BY_ERROR_CODE.get(errorCode));
    }

    private String lowerCamelId() {
        return toLowerCamel(name());
    }

    /**
     * {@code INPUT_PASSWORD_PROTECTED} to {@code inputPasswordProtected}, for i18n key building.
     */
    private static String toLowerCamel(String screamingSnake) {
        String[] parts = screamingSnake.toLowerCase(Locale.ROOT).split("_");
        StringBuilder out = new StringBuilder(parts[0]);
        for (int i = 1; i < parts.length; i++) {
            if (parts[i].isEmpty()) {
                continue;
            }
            out.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
        }
        return out.toString();
    }
}
