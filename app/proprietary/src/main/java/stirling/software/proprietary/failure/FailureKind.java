package stirling.software.proprietary.failure;

import static stirling.software.proprietary.failure.FailureActionId.DECRYPT;
import static stirling.software.proprietary.failure.FailureActionId.DISMISS;
import static stirling.software.proprietary.failure.FailureActionId.OPEN_IN_TOOL;
import static stirling.software.proprietary.failure.FailureActionId.REPAIR;
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

    /**
     * E003 rides along. PDFBox swallows every decryption failure during lazy dereference, so it is
     * not expected to render; claiming it only guarantees a known code never lands on {@link
     * #UNKNOWN} if that ever changes.
     */
    INPUT_CORRUPTED(
            FailureStage.INPUT,
            FailureSeverity.ERROR,
            FailureRemedy.NEEDS_FILE_FIX,
            FailureScope.FILE,
            errorCodes("E001", "E002", "E003"),
            fallback("This document is damaged, so the pipeline could not read it."),
            // Opening the tool is offered but not promoted: the same bytes fail the same way, so
            // it only helps when the upload itself truncated them.
            resolution(REPAIR, OWNER),
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

    /**
     * The format checks a tool runs before it reads anything: a PDF tool handed a .docx, a comic
     * reader handed something that is not the archive it names.
     */
    INPUT_WRONG_TYPE(
            FailureStage.INPUT,
            FailureSeverity.ERROR,
            FailureRemedy.NEEDS_FILE_FIX,
            FailureScope.FILE,
            errorCodes("E006", "E014", "E018", "E061"),
            fallback("This document is not a format the step can open, so it could not be read."),
            global(VIEW_FILE, OWNER, SECONDARY),
            global(VIEW_IN_PROCESSOR, TEAM_REVIEWER, OVERFLOW),
            global(OPEN_IN_TOOL, OWNER, OVERFLOW),
            global(DISMISS, ANYONE_WHO_SEES, OVERFLOW)),

    /**
     * The file is the type it claims and still will not open: an unopenable RAR or ZIP, an EML that
     * will not parse, image bytes no decoder accepts.
     *
     * <p>Deliberately does not offer REPAIR despite reading like {@link #INPUT_CORRUPTED}. Repair
     * is a PDF tool and none of these codes comes from a PDF.
     */
    INPUT_UNREADABLE(
            FailureStage.INPUT,
            FailureSeverity.ERROR,
            FailureRemedy.NEEDS_FILE_FIX,
            FailureScope.FILE,
            errorCodes("E010", "E015", "E021", "E034"),
            fallback("This document could not be opened, so the pipeline could not read it."),
            global(VIEW_FILE, OWNER, SECONDARY),
            global(VIEW_IN_PROCESSOR, TEAM_REVIEWER, OVERFLOW),
            global(OPEN_IN_TOOL, OWNER, OVERFLOW),
            global(DISMISS, ANYONE_WHO_SEES, OVERFLOW)),

    /** Opened fine and holds nothing to work on: no pages, no images, no bytes. */
    INPUT_EMPTY(
            FailureStage.INPUT,
            FailureSeverity.ERROR,
            FailureRemedy.PERMANENT,
            FailureScope.FILE,
            errorCodes("E005", "E012", "E016", "E020", "E032"),
            fallback("This document has no content in it, so there was nothing to work on."),
            global(VIEW_FILE, OWNER, SECONDARY),
            global(VIEW_IN_PROCESSOR, TEAM_REVIEWER, OVERFLOW),
            global(OPEN_IN_TOOL, OWNER, OVERFLOW),
            global(DISMISS, ANYONE_WHO_SEES, OVERFLOW)),

    /**
     * The run never got hold of the document: the id resolves to nothing, or the upload arrived
     * with no name to address it by.
     */
    INPUT_UNAVAILABLE(
            FailureStage.INPUT,
            FailureSeverity.ERROR,
            FailureRemedy.PERMANENT,
            FailureScope.FILE,
            errorCodes("E030", "E033"),
            fallback("The document behind this run could not be reached, so it was not processed."),
            // No VIEW_FILE and no OPEN_IN_TOOL: both would open a tool on a document that is not
            // there, which is the failure itself.
            global(VIEW_IN_PROCESSOR, TEAM_REVIEWER, OVERFLOW),
            global(DISMISS, ANYONE_WHO_SEES, OVERFLOW)),

    /**
     * A binary the step shells out to is absent from this deployment. Scoped to the server, not the
     * file, because it fails every run that reaches the step and one incident says that better than
     * one per document.
     */
    TOOL_NOT_INSTALLED(
            FailureStage.INTERNAL,
            FailureSeverity.ERROR,
            FailureRemedy.NEEDS_SERVER_FIX,
            FailureScope.SERVER,
            errorCodes("E042", "E062", "E063", "E080"),
            fallback("This server is missing software the step needs, so it could not be run."),
            // Nothing for an owner to press: their document is fine, and a retry fails the same
            // way until someone installs the binary.
            global(VIEW_IN_PROCESSOR, TEAM_REVIEWER, SECONDARY),
            global(DISMISS, ANYONE_WHO_SEES, OVERFLOW)),

    /**
     * Ghostscript reached a page it could not draw, which its output names.
     *
     * <p>Only the recognised page-drawing failure belongs here. E051 is the bucket {@code
     * ExceptionUtils.analyzeGhostscriptOutput} falls back to for output it does not recognise, so
     * it also carries killed processes and full disks, which a retry does clear.
     */
    STEP_CANNOT_RENDER_PAGE(
            FailureStage.INTERNAL,
            FailureSeverity.ERROR,
            FailureRemedy.NEEDS_FILE_FIX,
            FailureScope.FILE,
            errorCodes("E054"),
            fallback(
                    "A page in this document could not be drawn, so the pipeline could not finish."),
            global(VIEW_FILE, OWNER, SECONDARY),
            global(VIEW_IN_PROCESSOR, TEAM_REVIEWER, OVERFLOW),
            global(OPEN_IN_TOOL, OWNER, OVERFLOW),
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
