package stirling.software.proprietary.security.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class RedirectBaseUrlTest {

    @ParameterizedTest
    @CsvSource({
        "https://pdf.example.com, https://pdf.example.com",
        "https://pdf.example.com///, https://pdf.example.com",
        "'  https://pdf.example.com/  ', https://pdf.example.com",
        "http://10.0.0.5:8080, http://10.0.0.5:8080",
        "HTTPS://pdf.example.com/sub/, HTTPS://pdf.example.com/sub"
    })
    void normalisesValidUrls(String input, String expected) {
        assertThat(RedirectBaseUrl.parse(input)).contains(expected);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(
            strings = {
                "   ",
                "pdf.example.com",
                "/relative",
                "ftp://pdf.example.com",
                "https://pdf.example.com?x=1",
                "https://pdf.example.com#frag",
                "https://user:pw@pdf.example.com",
                "https://bad host"
            })
    void rejectsUnusableValues(String input) {
        assertThat(RedirectBaseUrl.parse(input)).isEmpty();
    }

    @ParameterizedTest
    @CsvSource(
            value = {
                "https://public.example/, http://localhost, https://public.example",
                "'', 'http://10.0.0.5:8080/ ', http://10.0.0.5:8080",
                "not-a-url, http://10.0.0.5, http://10.0.0.5",
            },
            emptyValue = "")
    void overrideWinsOverFallbackSetting(String override, String fallback, String expected) {
        assertThat(RedirectBaseUrl.overrideOr(override, fallback)).contains(expected);
    }

    @Test
    void overrideOrIsEmptyWhenNothingIsConfigured() {
        assertThat(RedirectBaseUrl.overrideOr(null, "  ")).isEmpty();
    }

    @Test
    void landingBaseNeedsAnOverrideAndPrefersTheFrontend() {
        assertThat(RedirectBaseUrl.landingBase(null, "https://app.example")).isEmpty();
        assertThat(RedirectBaseUrl.landingBase("https://api.example", null))
                .contains("https://api.example");
        assertThat(RedirectBaseUrl.landingBase("https://api.example", "https://app.example/"))
                .contains("https://app.example");
    }

    @Test
    void originDropsThePath() {
        assertThat(RedirectBaseUrl.origin("https://example.com:8443/pdf/"))
                .contains("https://example.com:8443");
    }
}
