package stirling.software.proprietary.failure;

import static stirling.software.proprietary.failure.FailureActionId.DECRYPT;
import static stirling.software.proprietary.failure.FailureActionId.DISMISS;
import static stirling.software.proprietary.failure.FailureActionId.OPEN_IN_TOOL;
import static stirling.software.proprietary.failure.FailureActionId.VIEW_FILE;
import static stirling.software.proprietary.failure.FailureActionId.VIEW_IN_PROCESSOR;
import static stirling.software.proprietary.failure.FailureActionSlot.OVERFLOW;
import static stirling.software.proprietary.failure.FailureActionSlot.SECONDARY;
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
 * The registry of failure kinds as data: id, i18n keys, English fallback, plus the facets a review
 * surface needs. A new kind ships as an entry plus copy; each offer says who it is for and where.
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
            // The password is the fix; the owner's own document is the runner-up.
            resolution(DECRYPT, OWNER),
            global(VIEW_FILE, OWNER, SECONDARY),
            global(VIEW_IN_PROCESSOR, TEAM_REVIEWER, OVERFLOW),
            global(OPEN_IN_TOOL, OWNER, OVERFLOW),
            global(DISMISS, ANYONE_WHO_SEES, OVERFLOW)),

    COMPLIANCE_NOT_MET(
            FailureStage.BLOCKED,
            FailureSeverity.ERROR,
            FailureRemedy.NEEDS_FILE_FIX,
            FailureScope.FILE,
            errorCodes("E074"),
            fallback("This document did not meet the compliance standard the policy checks for."),
            // No automated fix: the document itself has to change, so looking at it leads.
            global(VIEW_FILE, OWNER, SECONDARY),
            global(VIEW_IN_PROCESSOR, TEAM_REVIEWER, OVERFLOW),
            global(DISMISS, ANYONE_WHO_SEES, OVERFLOW)),

    UNKNOWN(
            FailureStage.INTERNAL,
            FailureSeverity.ERROR,
            FailureRemedy.PERMANENT,
            FailureScope.RUN,
            noErrorCodes(),
            fallback("This run failed for a reason Stirling does not yet recognise."),
            // No known fix to declare, so a plain retry leads: these are often one-offs.
            global(OPEN_IN_TOOL, OWNER, SECONDARY),
            global(VIEW_FILE, OWNER, SECONDARY),
            global(VIEW_IN_PROCESSOR, TEAM_REVIEWER, OVERFLOW),
            global(DISMISS, ANYONE_WHO_SEES, OVERFLOW));

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

    /** One ordered list, not parallel maps of audiences, slots and labels that could disagree. */
    private record Offer(
            FailureActionId id,
            FailureAudience audience,
            FailureActionSlot slot,
            String labelKeySuffix) {}

    /** The action that fixes this kind. One per kind: needing two would make it two kinds. */
    private static Offer resolution(FailureActionId id, FailureAudience audience) {
        return new Offer(id, audience, FailureActionSlot.RESOLUTION, null);
    }

    /** As {@link #resolution(FailureActionId, FailureAudience)}, with this kind's own wording. */
    private static Offer resolution(
            FailureActionId id, FailureAudience audience, String labelKeySuffix) {
        return new Offer(id, audience, FailureActionSlot.RESOLUTION, labelKeySuffix);
    }

    /** Not this kind's fix: an offer any kind can make, with the shared wording. */
    private static Offer global(
            FailureActionId id, FailureAudience audience, FailureActionSlot slot) {
        return new Offer(id, audience, slot, null);
    }

    /** As above, with this kind's own wording where the shared one reads badly. */
    private static Offer global(
            FailureActionId id,
            FailureAudience audience,
            FailureActionSlot slot,
            String labelKeySuffix) {
        return new Offer(id, audience, slot, labelKeySuffix);
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

    /** What this kind offers, in declaration order, each with label and placement resolved. */
    public List<OfferedAction> getOfferedActions() {
        return offers.stream()
                .map(
                        offer ->
                                new OfferedAction(
                                        offer.id(),
                                        labelKeyFor(offer.id()),
                                        offer.audience(),
                                        offer.slot()))
                .toList();
    }

    /** One action as a kind declares it: what to call it, who it is for, where it wants to sit. */
    public record OfferedAction(
            FailureActionId id,
            String labelKey,
            FailureAudience audience,
            FailureActionSlot slot) {}

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
