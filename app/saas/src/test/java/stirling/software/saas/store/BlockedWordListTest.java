package stirling.software.saas.store;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** The bundled list blocks profanity through the usual dodges and leaves ordinary words alone. */
class BlockedWordListTest {

    // The list the app loads: the bundled files, no operator file.
    private final BlockedWordList bundled = new BlockedWordList("");

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
                "pissed off",
                "porn filter",
                "wanker",
                "f*ck"
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
                "Matsushita product sheets"
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
}
