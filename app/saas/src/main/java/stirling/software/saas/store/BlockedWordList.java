package stirling.software.saas.store;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Blocked-word matching for listing text, resistant to the usual dodges. Text is folded first:
 * case, leetspeak ("sh1t", "@ss"), punctuation inside a word ("f.u.c.k"), runs of a repeated letter
 * ("fuuuck") and Unicode confusables all fold away, and a run of single letters ("f u c k") is read
 * as one word.
 *
 * <p>An entry is one of three kinds, so a list can be strict where it is safe and careful where it
 * is not:
 *
 * <ul>
 *   <li>{@code *root} matches anywhere inside a word, for terms no ordinary word contains, so
 *       "fucking" and "motherfucker" need no entries of their own. A root without doubled letters
 *       also matches through doubled letters ("fuuck").
 *   <li>{@code word} matches a whole word only, for terms that sit inside innocent words: "ass" in
 *       "class", "cock" in "peacock".
 *   <li>{@code two words} matches that run of whole words.
 * </ul>
 *
 * <p>The words themselves are not ours. They are the LDNOOBW lists, vendored unmodified under
 * {@code store/wordlists/ldnoobw} (CC BY 4.0, see the NOTICE there), one file per language, loaded
 * as whole words and phrases for the languages in {@code stirling.store.blocked-words.languages}
 * ({@code en} by default: a whole-word list in one language collides with ordinary words in
 * another, French "con" with English "pros and cons"). Languages written without spaces between
 * words (Chinese, Japanese, Thai) are matched anywhere instead. What is ours is matcher
 * configuration: {@code blocked-roots.txt}, the few roots worth matching inside a word, and {@code
 * allowed-words.txt}, the whole words that are never a hit ("Scunthorpe", clinical and legal
 * vocabulary). {@code stirling.store.blocked-words-file} adds an operator's own entries, in the
 * three-kind syntax above.
 *
 * <p>This is the fast, offline first pass. The store's content check ({@link
 * stirling.software.saas.store.moderation.StoreContentCheck}) then judges the text in context and
 * in any language.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "stirling.store.enabled", havingValue = "true")
public class BlockedWordList {

    private static final String ROOTS_RESOURCE = "store/blocked-roots.txt";
    private static final String ALLOWED_RESOURCE = "store/allowed-words.txt";
    private static final String LIST_RESOURCE = "store/wordlists/ldnoobw/%s.txt";

    /** Written without spaces between words, so a whole-word match would never fire. */
    private static final Set<String> UNSPACED_LANGUAGES = Set.of("zh", "ja", "th");

    private static final Pattern NOT_LETTER_DIGIT_OR_SPACE = Pattern.compile("[^\\p{L}\\p{N}\\s]");
    private static final Pattern REPEATS = Pattern.compile("(\\p{L})\\1{2,}");
    private static final Pattern DOUBLES = Pattern.compile("(\\p{L})\\1");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    private static final Pattern HAS_LETTER = Pattern.compile("\\p{L}");

    /** Fewer single letters in a row than this are just initials, not a spelled-out word. */
    private static final int SPELLED_OUT_MIN = 3;

    private final Entries blocked = new Entries();
    private final Set<String> allowed = new HashSet<>();

    /** The three kinds of entry, folded the way text is folded. */
    private static final class Entries {
        final Set<String> words = new HashSet<>();
        final Set<String> roots = new HashSet<>();
        final Set<String> phrases = new HashSet<>();

        boolean isEmpty() {
            return words.isEmpty() && roots.isEmpty() && phrases.isEmpty();
        }

        int size() {
            return words.size() + roots.size() + phrases.size();
        }

        /** A line in the three-kind syntax: {@code *root}, {@code word} or {@code two words}. */
        void add(String line) {
            String trimmed = line == null ? "" : line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                return;
            }
            boolean root = trimmed.startsWith("*");
            addEntry(root ? trimmed.substring(1) : trimmed, root);
        }

        /** A line of a vendored list: a plain word or phrase, no syntax. */
        void addListed(String line, boolean root) {
            String trimmed = line == null ? "" : line.trim();
            if (!trimmed.isEmpty()) {
                addEntry(trimmed, root);
            }
        }

        private void addEntry(String entry, boolean root) {
            String folded = fold(entry);
            // A root with no letter in it ("13", internet slang in the Chinese list) would match
            // every number that contains it.
            if (folded.isEmpty() || (root && !HAS_LETTER.matcher(folded).find())) {
                return;
            }
            if (root) {
                roots.add(folded.replace(" ", ""));
            } else if (folded.contains(" ")) {
                phrases.add(folded);
                // "blow job" is also written "blowjob".
                words.add(folded.replace(" ", ""));
            } else {
                words.add(folded);
            }
        }
    }

    @Autowired
    public BlockedWordList(
            @Value("${stirling.store.blocked-words.languages:en}") String languages,
            @Value("${stirling.store.blocked-words-file:}") String extraFile) {
        for (String language : languages.split(",")) {
            String code = language.trim().toLowerCase(Locale.ROOT);
            if (code.isEmpty()) {
                continue;
            }
            boolean unspaced = UNSPACED_LANGUAGES.contains(code);
            if (!readResource(
                    String.format(LIST_RESOURCE, code),
                    line -> blocked.addListed(line, unspaced))) {
                log.warn("No bundled blocked-word list for language '{}'", code);
            }
        }
        readResource(ROOTS_RESOURCE, blocked::add);
        readResource(ALLOWED_RESOURCE, this::allow);
        if (extraFile != null && !extraFile.isBlank()) {
            try {
                Files.readAllLines(Path.of(extraFile), StandardCharsets.UTF_8)
                        .forEach(blocked::add);
            } catch (IOException e) {
                log.warn("Could not read blocked-words file {}: {}", extraFile, e.getMessage());
            }
        }
        log.info(
                "Pipeline store blocked-word list loaded: {} blocked, {} allowed",
                blocked.size(),
                allowed.size());
    }

    private BlockedWordList() {}

    /** A list from literal entries, in the file's syntax, for tests and callers with their own. */
    public static BlockedWordList of(
            Collection<String> blockedEntries, Collection<String> allowedWords) {
        BlockedWordList list = new BlockedWordList();
        blockedEntries.forEach(list.blocked::add);
        allowedWords.forEach(list::allow);
        return list;
    }

    public boolean isEmpty() {
        return blocked.isEmpty();
    }

    /**
     * The first entry the text hits, in its folded form. For callers and tests, never for users.
     */
    public Optional<String> firstMatch(String text) {
        if (blocked.isEmpty() || text == null || text.isBlank()) {
            return Optional.empty();
        }
        List<String> words = new ArrayList<>();
        for (String word : WHITESPACE.split(fold(text))) {
            if (!word.isEmpty()) {
                words.add(word);
            }
        }
        String joined = " " + String.join(" ", words) + " ";
        for (String phrase : blocked.phrases) {
            if (joined.contains(" " + phrase + " ")) {
                return Optional.of(phrase);
            }
        }
        for (String word : withSpelledOutWords(words)) {
            if (allowed.contains(word)) {
                continue;
            }
            if (blocked.words.contains(word)) {
                return Optional.of(word);
            }
            String undoubled = undouble(word);
            for (String root : blocked.roots) {
                if (word.contains(root)
                        || (root.equals(undouble(root)) && undoubled.contains(root))) {
                    return Optional.of(root);
                }
            }
        }
        return Optional.empty();
    }

    /**
     * Fold text for comparison: NFKC, lower case, leetspeak mapped to letters, everything that is
     * not a letter, digit or space removed (so "f.u.c.k" and "f-u-c-k" become one word), and runs
     * of three or more of the same letter collapsed to one. Leetspeak is read only in a word that
     * also has a letter in it, so "sh1t" folds but a plain number like "455" stays a number.
     */
    static String fold(String text) {
        String s = Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        StringBuilder sb = new StringBuilder(s.length());
        for (String word : WHITESPACE.split(s)) {
            if (sb.length() > 0) {
                sb.append(' ');
            }
            sb.append(HAS_LETTER.matcher(word).find() ? unleet(word) : word);
        }
        String folded = NOT_LETTER_DIGIT_OR_SPACE.matcher(sb).replaceAll("");
        return WHITESPACE.matcher(REPEATS.matcher(folded).replaceAll("$1")).replaceAll(" ").trim();
    }

    private static String unleet(String word) {
        StringBuilder sb = new StringBuilder(word.length());
        for (int i = 0; i < word.length(); i++) {
            char c = word.charAt(i);
            sb.append(
                    switch (c) {
                        case '0' -> 'o';
                        case '1', '!', '|' -> 'i';
                        case '3' -> 'e';
                        case '4', '@' -> 'a';
                        case '5', '$' -> 's';
                        case '7' -> 't';
                        case '8' -> 'b';
                        default -> c;
                    });
        }
        return sb.toString();
    }

    /** The words, plus each run of single letters joined up, so "f u c k" is read as "fuck". */
    private static List<String> withSpelledOutWords(List<String> words) {
        List<String> out = new ArrayList<>(words);
        StringBuilder run = new StringBuilder();
        for (String word : words) {
            if (word.length() == 1) {
                run.append(word);
                continue;
            }
            if (run.length() >= SPELLED_OUT_MIN) {
                out.add(run.toString());
            }
            run.setLength(0);
        }
        if (run.length() >= SPELLED_OUT_MIN) {
            out.add(run.toString());
        }
        return out;
    }

    private static String undouble(String word) {
        return DOUBLES.matcher(word).replaceAll("$1");
    }

    private void allow(String line) {
        String trimmed = line == null ? "" : line.trim();
        if (trimmed.isEmpty() || trimmed.startsWith("#")) {
            return;
        }
        String folded = fold(trimmed).replace(" ", "");
        if (!folded.isEmpty()) {
            allowed.add(folded);
        }
    }

    /** Whether the resource exists. */
    private static boolean readResource(String resource, Consumer<String> sink) {
        try (InputStream in =
                BlockedWordList.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                return false;
            }
            try (BufferedReader reader =
                    new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                reader.lines().forEach(sink);
            }
            return true;
        } catch (IOException e) {
            log.warn("Could not read {}: {}", resource, e.getMessage());
            return false;
        }
    }
}
