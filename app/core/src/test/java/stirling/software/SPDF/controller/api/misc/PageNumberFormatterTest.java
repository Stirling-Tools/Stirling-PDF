package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;

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
    @ValueSource(ints = {0, -1, 4000})
    @DisplayName("values outside the Roman range fall back to decimal")
    void toRomanFallsBackOutsideRange(int value) {
        assertThat(PageNumberFormatter.toRoman(value)).isEqualTo(Integer.toString(value));
    }

    @ParameterizedTest
    @CsvSource({
        "1, numeric, 1",
        "12, numeric, 12",
        "4, roman-lowercase, iv",
        "4, roman-uppercase, IV",
        "1994, roman-lowercase, mcmxciv",
        "1994, roman-uppercase, MCMXCIV"
    })
    @DisplayName("format selects decimal or Roman output")
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
