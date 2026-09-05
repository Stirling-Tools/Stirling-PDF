package stirling.software.saas.store;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.Collection;
import java.util.HashSet;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Blocked-word matching for listing text, resistant to the usual dodges: case, leetspeak, spaced or
 * punctuated letters ("f.u.c.k"), repeated letters and Unicode confusables are all folded before a
 * whole-token comparison. Whole tokens only, never substrings, so "Scunthorpe" is not a hit; an
 * allow list handles the tokens that still collide.
 *
 * <p>The bundled list ships empty on purpose: the words themselves are operator data, not source
 * code. Drop a list such as the LDNOOBW "en" file into {@code store/blocked-words.txt} on the
 * classpath or point {@code stirling.store.blocked-words-file} at one.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "stirling.store.enabled", havingValue = "true")
public class BlockedWordList {

    private static final String BLOCKED_RESOURCE = "store/blocked-words.txt";
    private static final String ALLOWED_RESOURCE = "store/allowed-words.txt";
    private static final Pattern NOT_ALNUM_OR_SPACE = Pattern.compile("[^a-z0-9\\s]");
    private static final Pattern REPEATS = Pattern.compile("([a-z])\\1{2,}");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private final Set<String> blocked;
    private final Set<String> allowed;

    public BlockedWordList(@Value("${stirling.store.blocked-words-file:}") String extraFile) {
        this.blocked = new HashSet<>();
        this.allowed = new HashSet<>();
        readResource(BLOCKED_RESOURCE, blocked);
        readResource(ALLOWED_RESOURCE, allowed);
        if (extraFile != null && !extraFile.isBlank()) {
            try {
                Files.readAllLines(Path.of(extraFile), StandardCharsets.UTF_8)
                        .forEach(line -> addWord(blocked, line));
            } catch (IOException e) {
                log.warn("Could not read blocked-words file {}: {}", extraFile, e.getMessage());
            }
        }
        log.info(
                "Pipeline store blocked-word list loaded: {} blocked, {} allowed",
                blocked.size(),
                allowed.size());
    }

    private BlockedWordList(Set<String> blocked, Set<String> allowed) {
        this.blocked = blocked;
        this.allowed = allowed;
    }

    /** A list from literal words, for tests and for callers that hold their own list. */
    public static BlockedWordList of(
            Collection<String> blockedWords, Collection<String> allowedWords) {
        Set<String> blocked = new HashSet<>();
        Set<String> allowed = new HashSet<>();
        blockedWords.forEach(word -> addWord(blocked, word));
        allowedWords.forEach(word -> addWord(allowed, word));
        return new BlockedWordList(blocked, allowed);
    }

    public boolean isEmpty() {
        return blocked.isEmpty();
    }

    /**
     * The first blocked token found, in its folded form. For callers and tests, never for users.
     */
    public Optional<String> firstMatch(String text) {
        if (blocked.isEmpty() || text == null || text.isBlank()) {
            return Optional.empty();
        }
        for (String token : WHITESPACE.split(fold(text))) {
            if (token.isEmpty() || allowed.contains(token)) {
                continue;
            }
            if (blocked.contains(token)) {
                return Optional.of(token);
            }
        }
        return Optional.empty();
    }

    /**
     * Fold text for comparison: NFKC, lower case, leetspeak mapped to letters, everything that is
     * not a letter, digit or space removed (so "f.u.c.k" and "f-u-c-k" become one token), and runs
     * of three or more of the same letter collapsed to one.
     */
    static String fold(String text) {
        String s = Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
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
        String folded = NOT_ALNUM_OR_SPACE.matcher(sb).replaceAll("");
        return REPEATS.matcher(folded).replaceAll("$1").trim();
    }

    private static void addWord(Set<String> target, String line) {
        String trimmed = line == null ? "" : line.trim();
        if (trimmed.isEmpty() || trimmed.startsWith("#")) {
            return;
        }
        String folded = fold(trimmed).replace(" ", "");
        if (!folded.isEmpty()) {
            target.add(folded);
        }
    }

    private static void readResource(String resource, Set<String> target) {
        try (InputStream in =
                BlockedWordList.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                return;
            }
            try (BufferedReader reader =
                    new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                reader.lines().forEach(line -> addWord(target, line));
            }
        } catch (IOException e) {
            log.warn("Could not read {}: {}", resource, e.getMessage());
        }
    }
}
