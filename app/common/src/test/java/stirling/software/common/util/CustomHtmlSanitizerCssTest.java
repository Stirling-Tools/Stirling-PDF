package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.SsrfProtectionService;

/**
 * Pins the CSS closure that keeps LibreOffice and WeasyPrint from fetching what a page's styles
 * name. It is a property of the policy this application builds, not of any code here: {@code
 * Sanitizers.STYLES} drops a declaration carrying a {@code url(...)} because nothing calls {@code
 * allowUrlsInStyles}, and {@code style}/{@code link}/{@code base} are not allowed elements. A
 * dependency bump, or a well-meant "route CSS urls through the SSRF service", silently reopens
 * every route below, and nothing else in the suite would notice.
 *
 * <p>SSRF checking is switched OFF here on purpose. With it on, a payload can pass because the host
 * was refused rather than because the CSS was dropped, and the test would keep passing after the
 * closure was lost.
 */
@DisplayName("CustomHtmlSanitizer css reference closure")
class CustomHtmlSanitizerCssTest {

    private static final String SENTINEL_HOST = "sentinel.example";

    private CustomHtmlSanitizer sanitizer;

    @BeforeEach
    void setUp() {
        ApplicationProperties applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().getHtml().getUrlSecurity().setEnabled(false);
        sanitizer =
                new CustomHtmlSanitizer(
                        new SsrfProtectionService(applicationProperties), applicationProperties);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(
            strings = {
                "<table><tr><td style=\"background:url(http://sentinel.example/A)\">x</td></tr></table>",
                "<p style=\"background:URL('http://sentinel.example/B') !important\">x</p>",
                "<p style=\"background:ur/**/l(http://sentinel.example/C)\">x</p>",
                "<p style=\"background:\\75 rl(http://sentinel.example/D)\">x</p>",
                "<p style=\"background-image:url(http://sentinel.example/E)\">x</p>",
                "<p style=\"list-style-image:url(http://sentinel.example/F)\">x</p>",
                "<p style=\"background:url(file:///etc/passwd)\">x</p>",
                "<style>td { background: url(http://sentinel.example/G) }</style>",
                "<style>@import url(http://sentinel.example/H);</style>",
                "<style>@font-face { src: url(http://sentinel.example/I) }</style>",
                "<link rel=\"stylesheet\" href=\"http://sentinel.example/J\">",
                "<base href=\"http://sentinel.example/K/\"><img src=\"relative.gif\">",
                "<table background=\"http://sentinel.example/L\"><tr>"
                        + "<td background=\"http://sentinel.example/M\">x</td></tr></table>",
                "<div style=\"behavior:url(http://sentinel.example/N)\">x</div>"
            })
    @DisplayName("no styling route can carry a reference out of the document")
    void noStylingRouteSurvives(String html) {
        String sanitized = sanitizer.sanitize(html);

        assertThat(sanitized).doesNotContain(SENTINEL_HOST);
        assertThat(sanitized).doesNotContain("file:");
        assertThat(sanitized.toLowerCase()).doesNotContain("url(");
        assertThat(sanitized.toLowerCase()).doesNotContain("<style");
        assertThat(sanitized.toLowerCase()).doesNotContain("<link");
        assertThat(sanitized.toLowerCase()).doesNotContain("<base");
        assertThat(sanitized.toLowerCase()).doesNotContain("@import");
        assertThat(sanitized.toLowerCase()).doesNotContain("@font-face");
        assertThat(sanitized.toLowerCase()).doesNotContain("background=");
    }

    @Test
    @DisplayName("the styling an ordinary page relies on is still honoured")
    void ordinaryStylingSurvives() {
        String sanitized =
                sanitizer.sanitize(
                        "<h1 style=\"color:#003366;font-size:18pt\">Invoice</h1>"
                                + "<table><tr><th style=\"background-color:#eeeeee\">Item</th></tr>"
                                + "<tr><td style=\"text-align:right\">2</td></tr></table>"
                                + "<p style=\"font-family:Courier,monospace\">STIRLINGSENTINEL</p>");

        assertThat(sanitized).contains("color:#003366");
        assertThat(sanitized).contains("font-size:18pt");
        assertThat(sanitized).contains("background-color:#eeeeee");
        assertThat(sanitized).contains("text-align:right");
        assertThat(sanitized).contains("STIRLINGSENTINEL");
    }
}
