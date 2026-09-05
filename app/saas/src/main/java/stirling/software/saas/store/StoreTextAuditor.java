package stirling.software.saas.store;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * Audits the free text a publisher types (name, description, what changed) before it can be public.
 * Layered and server-side: normalise, reject markup (the store holds plain text only), reject leaks
 * (emails, addresses, internal hostnames), reject blocked and reserved words, reject unreadable
 * text. Each failure is a preflight finding that names the field, never the offending word. A
 * hosted moderation classifier is a later layer behind a provider flag; this is the floor.
 */
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "stirling.store.enabled", havingValue = "true")
public class StoreTextAuditor {

    static final int NAME_MIN = 3;
    static final int NAME_MAX = 80;
    static final int DESCRIPTION_MIN = 20;
    static final int DESCRIPTION_MAX = 500;
    static final int WHAT_CHANGED_MAX = 300;

    /** Words that would let a listing pose as Stirling's own. Curated listings are exempt. */
    static final Set<String> RESERVED = Set.of("stirling", "official", "verified", "curated");

    private static final Pattern CONTROL_OR_FORMAT = Pattern.compile("[\\p{Cc}\\p{Cf}&&[^\\n\\t]]");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    private static final Pattern MARKUP = Pattern.compile("<\\s*/?\\s*[A-Za-z!?]|&#\\d+;|&[a-z]+;");
    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{N}]+");

    private final BlockedWordList blockedWords;

    public List<StoreFinding> audit(PublishRequest request, boolean curated) {
        List<StoreFinding> findings = new ArrayList<>();
        findings.addAll(
                auditField("Name", request.trimmedName(), NAME_MIN, NAME_MAX, true, curated));
        findings.addAll(
                auditField(
                        "Description",
                        request.trimmedDescription(),
                        DESCRIPTION_MIN,
                        DESCRIPTION_MAX,
                        false,
                        curated));
        String whatChanged = request.trimmedWhatChanged();
        if (whatChanged != null) {
            findings.addAll(
                    auditField("What changed", whatChanged, 0, WHAT_CHANGED_MAX, false, curated));
        }
        return findings;
    }

    /**
     * NFKC, control and format characters (zero-width, bidi overrides) gone, whitespace collapsed.
     */
    static String clean(String raw) {
        if (raw == null) {
            return "";
        }
        String normalized = Normalizer.normalize(raw, Normalizer.Form.NFKC);
        normalized = CONTROL_OR_FORMAT.matcher(normalized).replaceAll("");
        return WHITESPACE.matcher(normalized).replaceAll(" ").trim();
    }

    List<StoreFinding> auditField(
            String label, String raw, int min, int max, boolean isName, boolean curated) {
        List<StoreFinding> findings = new ArrayList<>();
        StoreFinding.Where where = StoreFinding.Where.details();
        String text = clean(raw);

        if (text.length() < min) {
            findings.add(
                    StoreFinding.block(
                            "text-too-short",
                            label + " is too short",
                            "Use at least " + min + " characters.",
                            where));
            return findings;
        }
        if (text.length() > max) {
            findings.add(
                    StoreFinding.block(
                            "text-too-long",
                            label + " is too long",
                            "Use at most " + max + " characters.",
                            where));
        }
        if (MARKUP.matcher(text).find()) {
            findings.add(
                    StoreFinding.block(
                            "markup",
                            label + " contains markup",
                            "The store shows plain text only. Remove tags and formatting.",
                            where));
        }
        if (StoreManifestSanitizer.EMAIL.matcher(text).find()) {
            findings.add(
                    StoreFinding.block(
                            "email-in-text",
                            label + " contains an email address",
                            "Remove it. Teammates see the author automatically; nobody else"
                                    + " should.",
                            where));
        }
        if (StoreManifestSanitizer.URL_WITH_CREDENTIALS.matcher(text).find()) {
            findings.add(
                    StoreFinding.block(
                            "url-credentials",
                            label + " contains a link with credentials",
                            "Remove the username and password from the address.",
                            where));
        } else if (StoreManifestSanitizer.IPV4.matcher(text).find()
                || StoreManifestSanitizer.IPV6.matcher(text).find()) {
            findings.add(
                    StoreFinding.block(
                            "address-in-text",
                            label + " contains a network address",
                            "Addresses are specific to one network. Remove it.",
                            where));
        } else {
            Matcher host = StoreManifestSanitizer.PRIVATE_HOST.matcher(text);
            if (host.find()) {
                findings.add(
                        StoreFinding.block(
                                "private-host-in-text",
                                label + " names an internal system",
                                "\""
                                        + host.group(1)
                                        + "\" looks like an internal hostname. Reword it.",
                                where));
            } else if (StoreManifestSanitizer.URL.matcher(text).find()) {
                findings.add(
                        StoreFinding.warn(
                                "url-in-text",
                                label + " contains a link",
                                "Links are published as written. Make sure it is public.",
                                where));
            }
        }
        if (blockedWords.firstMatch(text).isPresent()) {
            findings.add(
                    StoreFinding.block(
                            "blocked-word",
                            label + " contains language that is not allowed",
                            "The store checks names and descriptions against a blocked-word list."
                                    + " Reword it, then run the checks again.",
                            where));
        }
        if (isName && !curated) {
            reservedWord(text)
                    .ifPresent(
                            word ->
                                    findings.add(
                                            StoreFinding.block(
                                                    "reserved-word",
                                                    label + " uses a reserved word",
                                                    "\""
                                                            + word
                                                            + "\" is reserved for listings curated by"
                                                            + " Stirling. Choose another name.",
                                                    where)));
        }
        if (!isReadable(text)) {
            findings.add(
                    StoreFinding.block(
                            "unreadable",
                            label + " is not readable",
                            "Use words, not symbols.",
                            where));
        }
        return findings;
    }

    static java.util.Optional<String> reservedWord(String text) {
        Matcher words = WORD.matcher(text.toLowerCase(Locale.ROOT));
        while (words.find()) {
            if (RESERVED.contains(words.group())) {
                return java.util.Optional.of(words.group());
            }
        }
        return java.util.Optional.empty();
    }

    /**
     * At least two fifths of the non-space characters are letters, once the text is long enough to
     * judge.
     */
    static boolean isReadable(String text) {
        int letters = 0;
        int total = 0;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            i += Character.charCount(cp);
            if (Character.isWhitespace(cp)) {
                continue;
            }
            total++;
            if (Character.isLetter(cp)) {
                letters++;
            }
        }
        return total < 8 || letters * 5 >= total * 2;
    }
}
