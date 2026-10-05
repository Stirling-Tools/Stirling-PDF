package stirling.software.saas.store;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** The bundled list blocks profanity through the usual dodges and leaves ordinary words alone. */
class BlockedWordListTest {

    // The list the app loads by default: the vendored English list, the roots, no operator file.
    private final BlockedWordList bundled = new BlockedWordList("en", "");

    @Test
    void theBundledListIsNotEmpty() {
        assertThat(bundled.isEmpty()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Fuck this pipeline",
                "FUCKING good compression",
                "the motherfucker of all pipelines",
                "f.u.c.k",
                "f u c k the queue",
                "fuuuuuck",
                "fuuck",
                "sh1t",
                "$h!t happens",
                "total bullshit",
                "kick a$$ OCR",
                "you ass",
                "a blow job",
                "blowjob",
                "c u n t",
                "dickhead detector",
                "pissing contest",
                "porn filter",
                "wanker",
                "camwhore",
                "s h i t"
            })
    void profanityIsBlocked(String text) {
        assertThat(bundled.firstMatch(text)).as(text).isPresent();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Scunthorpe invoices",
                "Assistant for classic class work",
                "Assess and assist",
                "Cocktail menu for the peacock bar",
                "Dickens and Hancock archive",
                "Shiitake supplier orders",
                "Swanky Wankel engines",
                "A niggardly budget",
                "Compress scans to 455 KB",
                "Sussex and Essex offices",
                "Pass the therapist notes to the grape growers",
                "Cumulative documents and cucumbers",
                "Fire retardant data sheets",
                "Shell scripts say hello",
                "Step 1 of 3, then OCR",
                "Matsushita product sheets",
                "Sexual harassment complaint intake",
                "Abuse case files for the safeguarding team",
                "Adult social care and welfare claim forms",
                "Attack surface report",
                "Jewish community archive",
                "Asian markets research",
                "RAM and CPU usage report",
                "Pros and cons of each template",
                "Market domination analysis",
                "Page xx of yy"
            })
    void ordinaryWordsAreNot(String text) {
        assertThat(bundled.firstMatch(text)).as(text).isEmpty();
    }

    @Test
    void anOperatorListAddsEntriesInTheSameSyntax() {
        BlockedWordList list =
                BlockedWordList.of(List.of("*zorb", "plonk", "very bad"), List.of("zorbing"));

        assertThat(list.firstMatch("Zorblax tools")).contains("zorb");
        assertThat(list.firstMatch("zorbing weekend")).isEmpty();
        assertThat(list.firstMatch("plonker")).isEmpty();
        assertThat(list.firstMatch("a plonk")).contains("plonk");
        assertThat(list.firstMatch("this is very bad")).contains("very bad");
        assertThat(list.firstMatch("verybad")).contains("verybad");
    }

    @Test
    void otherLanguagesAreOptIn() {
        // "con" is French profanity and an ordinary English word, which is why only English loads
        // by default.
        assertThat(bundled.firstMatch("Pros and con lists")).isEmpty();
        BlockedWordList withFrench = new BlockedWordList("en,fr", "");
        assertThat(withFrench.firstMatch("quel con")).isPresent();
    }

    @Test
    void unspacedLanguagesMatchInsideARunOfText() {
        String entry = firstEntry("zh");
        BlockedWordList chinese = new BlockedWordList("zh", "");

        assertThat(chinese.firstMatch("这是" + entry + "的文件")).isPresent();
    }

    @Test
    void aRootWithoutALetterIsIgnored() {
        BlockedWordList chinese = new BlockedWordList("zh", "");
        // "13" alone is slang in the list; the 13th of the month must still get through.
        assertThat(chinese.firstMatch("会议在13号开始")).isEmpty();
    }

    @Test
    void anUnknownLanguageIsSkipped() {
        assertThat(new BlockedWordList("xx-not-a-language", "").isEmpty()).isFalse();
    }

    private static String firstEntry(String language) {
        try (var in =
                BlockedWordListTest.class
                        .getClassLoader()
                        .getResourceAsStream("store/wordlists/ldnoobw/" + language + ".txt")) {
            return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8)
                    .lines()
                    // A real word: two or more Han characters, not the list's numeric slang.
                    .filter(line -> line.trim().matches("\\p{IsHan}{2,}"))
                    .findFirst()
                    .orElseThrow()
                    .trim();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
