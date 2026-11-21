package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("PageNumberFormatter")
class PageNumberFormatterTest {

    @ParameterizedTest
    @CsvSource({
        "1, I",
        "4, IV",
        "9, IX",
        "40, XL",
        "90, XC",
        "400, CD",
        "1994, MCMXCIV",
        "2026, MMXXVI",
        "3999, MMMCMXCIX"
    })
    @DisplayName("toRoman uses subtractive notation")
    void toRoman(int value, String expected) {
        assertThat(PageNumberFormatter.toRoman(value)).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1})
    @DisplayName("non-positive values fall back to decimal")
    void toRomanFallsBackForNonPositive(int value) {
        assertThat(PageNumberFormatter.toRoman(value)).isEqualTo(Integer.toString(value));
    }

    @ParameterizedTest
    @CsvSource({"4000, MMMM", "5000, MMMMM", "10000, MMMMMMMMMM"})
    @DisplayName("values above 3999 extend by repeating M")
    void toRomanExtendsAboveThreeThousandNineHundredNinetyNine(int value, String expected) {
        assertThat(PageNumberFormatter.toRoman(value)).isEqualTo(expected);
    }

    @Test
    @DisplayName("toRoman supports large values within the label length limit")
    void toRomanSupportsLargeValues() {
        assertThat(PageNumberFormatter.toRoman(1_000_000)).isEqualTo("M".repeat(1000));
    }

    @Test
    @DisplayName("toRoman accepts a label exactly at the length limit")
    void toRomanAcceptsLabelAtLimit() {
        assertThat(PageNumberFormatter.toRoman(4_096_000)).hasSize(4096);
    }

    @Test
    @DisplayName("toRoman rejects a label above the length limit")
    void toRomanRejectsOversizedLabel() {
        assertThatThrownBy(() -> PageNumberFormatter.toRoman(4_096_999))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("maximum length");
    }

    @ParameterizedTest
    @CsvSource({"1, A", "2, B", "26, Z", "27, AA", "52, AZ", "53, BA", "702, ZZ", "703, AAA"})
    @DisplayName("toAlphabetic uses spreadsheet-style letters")
    void toAlphabetic(int value, String expected) {
        assertThat(PageNumberFormatter.toAlphabetic(value)).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1})
    @DisplayName("non-positive alphabetic values fall back to decimal")
    void toAlphabeticFallsBackForNonPositive(int value) {
        assertThat(PageNumberFormatter.toAlphabetic(value)).isEqualTo(Integer.toString(value));
    }

    @ParameterizedTest
    @CsvSource({
        "1, numeric, 1",
        "12, numeric, 12",
        "4, roman-lowercase, iv",
        "4, roman-uppercase, IV",
        "1994, roman-lowercase, mcmxciv",
        "1994, roman-uppercase, MCMXCIV",
        "4000, roman-uppercase, MMMM",
        "1, alpha-lowercase, a",
        "26, alpha-uppercase, Z",
        "27, alpha-lowercase, aa",
        "53, alpha-uppercase, BA"
    })
    @DisplayName("format selects decimal, Roman or alphabetic output")
    void format(int value, String numberFormat, String expected) {
        assertThat(PageNumberFormatter.format(value, numberFormat)).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "unknown"})
    @DisplayName("unknown formats fall back to numeric")
    void unknownFormatsFallBackToNumeric(String numberFormat) {
        assertThat(PageNumberFormatter.format(7, numberFormat)).isEqualTo("7");
    }

    @Test
    @DisplayName("null format falls back to numeric")
    void nullFormat() {
        assertThat(PageNumberFormatter.format(7, null)).isEqualTo("7");
    }

    @Test
    @DisplayName("format names are case-insensitive")
    void formatNameCaseInsensitive() {
        assertThat(PageNumberFormatter.format(7, "ROMAN-UPPERCASE")).isEqualTo("VII");
    }
}
