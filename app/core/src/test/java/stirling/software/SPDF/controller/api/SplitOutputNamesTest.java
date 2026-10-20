package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class SplitOutputNamesTest {

    private static final char LINE_SEPARATOR = 0x2028;

    @Test
    @DisplayName("A blank line keeps the default name for its slot")
    void blankLineKeepsDefault() {
        assertThat(SplitOutputNames.resolve("\nB\n\nD", null, "in", 5))
                .containsExactly("in_1.pdf", "B.pdf", "in_3.pdf", "D.pdf", "in_5.pdf");
    }

    @Test
    @DisplayName("No names gives the default numbering")
    void noNames() {
        assertThat(SplitOutputNames.resolve(null, null, "in", 2))
                .containsExactly("in_1.pdf", "in_2.pdf");
        assertThat(SplitOutputNames.resolve(" \n ", null, "in", 2))
                .containsExactly("in_1.pdf", "in_2.pdf");
    }

    @Test
    @DisplayName("A name the user typed keeps its exact form over a generated suffix")
    void userNameWinsOverSuffix() {
        assertThat(SplitOutputNames.resolve("a\nA\na_2", null, "in", 3))
                .containsExactly("a.pdf", "A_3.pdf", "a_2.pdf");
    }

    @Test
    @DisplayName("A default that collides with a user's name takes the suffix")
    void defaultYieldsToUserName() {
        assertThat(SplitOutputNames.resolve("in_3", null, "in", 3))
                .containsExactly("in_3.pdf", "in_2.pdf", "in_3_2.pdf");
    }

    @Test
    @DisplayName("Names past the last document do not reserve anything")
    void unusedNamesReserveNothing() {
        assertThat(SplitOutputNames.resolve("\n\nin_2", null, "in", 2))
                .containsExactly("in_1.pdf", "in_2.pdf");
    }

    @Test
    @DisplayName("A pattern names every document, replacing {n} with its number")
    void patternNamesEveryDocument() {
        assertThat(SplitOutputNames.resolve(null, "Chapter {n}", "in", 3))
                .containsExactly("Chapter 1.pdf", "Chapter 2.pdf", "Chapter 3.pdf");
        assertThat(SplitOutputNames.resolve(null, "{n} of set {n}", "in", 2))
                .containsExactly("1 of set 1.pdf", "2 of set 2.pdf");
    }

    @Test
    @DisplayName("A pattern without {n} has the number appended")
    void patternWithoutTokenAppendsNumber() {
        assertThat(SplitOutputNames.resolve(null, " Part ", "in", 2))
                .containsExactly("Part 1.pdf", "Part 2.pdf");
    }

    @Test
    @DisplayName("Listed names win over the pattern for their documents")
    void listedNamesOverridePattern() {
        assertThat(SplitOutputNames.resolve("Cover\n\nPart 2", "Part {n}", "in", 4))
                .containsExactly("Cover.pdf", "Part 2_2.pdf", "Part 2.pdf", "Part 4.pdf");
    }

    @Test
    @DisplayName("A pattern is sanitised like a typed name")
    void patternIsSanitised() {
        assertThat(SplitOutputNames.resolve(null, "../{n}.pdf", "in", 2))
                .containsExactly("_1.pdf", "_2.pdf");
        assertThat(SplitOutputNames.resolve(null, "...", "in", 2))
                .containsExactly("1.pdf", "2.pdf");
    }

    @ParameterizedTest(name = "[{index}] \"{0}\" -> \"{1}\"")
    @CsvSource(
            delimiter = '|',
            value = {
                "Report|Report",
                "  Report.pdf  |Report",
                "Report.PDF.pdf|Report",
                "Report .pdf.|Report",
                ".pdf|''",
                "../../etc/passwd|_.._etc_passwd",
                "..\\evil|_evil",
                ".hidden|hidden",
                "a:b*c?d|a_b_c_d",
                "CON|CON_",
                "con.backup|con_.backup",
                "LPT9|LPT9_",
                "CONSOLE|CONSOLE",
                "COM0|COM0",
                "Kapitel ünf 章|Kapitel ünf 章",
            })
    void sanitizes(String line, String expected) {
        assertThat(SplitOutputNames.sanitize(line)).isEqualTo(expected);
    }

    @Test
    @DisplayName("Control characters and line separators are removed")
    void stripsControlCharacters() {
        assertThat(SplitOutputNames.sanitize("a\u0000b\tc\u007Fd" + LINE_SEPARATOR + "e"))
                .isEqualTo("abcde");
    }

    @Test
    @DisplayName("Long names are capped by UTF-8 bytes without splitting a character")
    void capsLengthByBytes() {
        String ascii = SplitOutputNames.sanitize("x".repeat(300));
        assertThat(ascii).hasSize(SplitOutputNames.MAX_NAME_BYTES);

        String cjk = SplitOutputNames.sanitize("章".repeat(100));
        assertThat(cjk.getBytes(StandardCharsets.UTF_8).length)
                .isLessThanOrEqualTo(SplitOutputNames.MAX_NAME_BYTES);
        assertThat(cjk).isEqualTo("章".repeat(SplitOutputNames.MAX_NAME_BYTES / 3));

        String emoji = SplitOutputNames.sanitize("a" + "😀".repeat(60));
        assertThat(emoji.getBytes(StandardCharsets.UTF_8).length)
                .isLessThanOrEqualTo(SplitOutputNames.MAX_NAME_BYTES);
        assertThat(Character.isHighSurrogate(emoji.charAt(emoji.length() - 1))).isFalse();
    }
}
