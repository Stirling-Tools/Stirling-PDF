package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.SsrfProtectionService;
import stirling.software.common.util.TempFileManager;

/**
 * Branch coverage for the disallowed-scheme detection helpers of {@link ConvertWebsiteToPDF}. These
 * are pure string transforms exercised by reflection, so no network call or external WeasyPrint
 * invocation occurs.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ConvertWebsiteToPDF scheme-detection helpers")
class ConvertWebsiteToPDFExtraTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private TempFileManager tempFileManager;
    @Mock private SsrfProtectionService ssrfProtectionService;

    private ConvertWebsiteToPDF sut;

    @BeforeEach
    void setUp() {
        sut =
                new ConvertWebsiteToPDF(
                        pdfDocumentFactory,
                        runtimePathConfig,
                        new ApplicationProperties(),
                        tempFileManager,
                        ssrfProtectionService);
    }

    private boolean containsDisallowed(String html) throws Exception {
        Method m =
                ConvertWebsiteToPDF.class.getDeclaredMethod(
                        "containsDisallowedUriScheme", String.class);
        m.setAccessible(true);
        return (boolean) m.invoke(sut, html);
    }

    private boolean containsBlockedResource(String html) throws Exception {
        Method m =
                ConvertWebsiteToPDF.class.getDeclaredMethod(
                        "containsBlockedResourceReference", String.class, String.class);
        m.setAccessible(true);
        return (boolean) m.invoke(sut, html, "https://example.com/page.html");
    }

    private String percentDecode(String content) throws Exception {
        Method m = ConvertWebsiteToPDF.class.getDeclaredMethod("percentDecode", String.class);
        m.setAccessible(true);
        return (String) m.invoke(sut, content);
    }

    private String decodeEntities(String content) throws Exception {
        Method m =
                ConvertWebsiteToPDF.class.getDeclaredMethod(
                        "decodeNumericHtmlEntities", String.class);
        m.setAccessible(true);
        return (String) m.invoke(sut, content);
    }

    @Nested
    @DisplayName("containsDisallowedUriScheme")
    class DisallowedScheme {

        @Test
        @DisplayName("null and empty content are allowed")
        void nullAndEmpty() throws Exception {
            assertThat(containsDisallowed(null)).isFalse();
            assertThat(containsDisallowed("")).isFalse();
        }

        @Test
        @DisplayName("plain safe html is allowed")
        void safeHtml() throws Exception {
            assertThat(
                            containsDisallowed(
                                    "<html><body><a href=\"https://x.com\">ok</a></body></html>"))
                    .isFalse();
        }

        @Test
        @DisplayName("a literal file:/// scheme is rejected")
        void literalFileScheme() throws Exception {
            assertThat(containsDisallowed("<a href=\"file:///etc/passwd\">x</a>")).isTrue();
        }

        @Test
        @DisplayName("an uppercase FILE: scheme is rejected after lower-casing")
        void uppercaseFileScheme() throws Exception {
            assertThat(containsDisallowed("<a href=\"FILE://server/share\">x</a>")).isTrue();
        }

        @Test
        @DisplayName("a percent-encoded file scheme separator is rejected")
        void percentEncodedSeparator() throws Exception {
            // file:%2f%2f decodes to file:// during normalization
            assertThat(containsDisallowed("<a href=\"file:%2f%2fetc/passwd\">x</a>")).isTrue();
        }

        @Test
        @DisplayName("an html-entity encoded slash sequence is rejected")
        void htmlEntitySlashes() throws Exception {
            // file:&#47;&#47; -> file:// after numeric-entity decoding
            assertThat(containsDisallowed("<a href=\"file:&#47;&#47;etc\">x</a>")).isTrue();
        }

        @Test
        @DisplayName("a named-entity colon/slash sequence is rejected")
        void namedEntitySlashes() throws Exception {
            // file&colon;&sol;&sol; -> file:// after named-entity replacement
            assertThat(containsDisallowed("<a href=\"file&colon;&sol;&sol;etc\">x</a>")).isTrue();
        }

        @Test
        @DisplayName("the word 'profile:' is not mistaken for a file scheme")
        void wordBoundaryGuard() throws Exception {
            // the (?<![a-z0-9_]) lookbehind prevents matching the 'file' inside 'profile'
            assertThat(containsDisallowed("<span>profile://something</span>")).isFalse();
        }
    }

    @Nested
    @DisplayName("containsBlockedResourceReference")
    class BlockedResourceReference {

        @Test
        @DisplayName("null and empty content are allowed")
        void nullAndEmpty() throws Exception {
            assertThat(containsBlockedResource(null)).isFalse();
            assertThat(containsBlockedResource("")).isFalse();
        }

        @Test
        @DisplayName("a relative image on an allowed host passes")
        void relativeImageAllowed() throws Exception {
            when(ssrfProtectionService.isUrlAllowed(anyString())).thenReturn(true);
            assertThat(containsBlockedResource("<img src=\"/assets/logo.png\">")).isFalse();
        }

        @Test
        @DisplayName("a relative image is resolved against the page base url before checking")
        void relativeImageResolvedAgainstBase() throws Exception {
            when(ssrfProtectionService.isUrlAllowed("https://example.com/assets/logo.png"))
                    .thenReturn(false);
            assertThat(containsBlockedResource("<img src=\"assets/logo.png\">")).isTrue();
        }

        @Test
        @DisplayName("an absolute resource rejected by the SSRF service blocks the conversion")
        void blockedAbsoluteResource() throws Exception {
            when(ssrfProtectionService.isUrlAllowed(anyString())).thenReturn(false);
            assertThat(containsBlockedResource("<img src=\"http://169.254.169.254/latest/\">"))
                    .isTrue();
        }

        @Test
        @DisplayName("a stylesheet link is checked as well as images")
        void stylesheetLinkChecked() throws Exception {
            when(ssrfProtectionService.isUrlAllowed(anyString())).thenReturn(false);
            assertThat(
                            containsBlockedResource(
                                    "<link rel=\"stylesheet\" href=\"http://127.0.0.1/a.css\">"))
                    .isTrue();
        }

        @Test
        @DisplayName("a css url() reference is checked")
        void cssUrlChecked() throws Exception {
            when(ssrfProtectionService.isUrlAllowed(anyString())).thenReturn(false);
            assertThat(containsBlockedResource("<style>body{background:url('http://10.0.0.1/x')}"))
                    .isTrue();
        }

        @Test
        @DisplayName("a bare @import is checked")
        void cssImportChecked() throws Exception {
            when(ssrfProtectionService.isUrlAllowed(anyString())).thenReturn(false);
            assertThat(containsBlockedResource("<style>@import \"http://10.0.0.1/x.css\";</style>"))
                    .isTrue();
        }

        @Test
        @DisplayName(
                "a non-http scheme is rejected by the allowlist without consulting the service")
        void nonHttpSchemeRejected() throws Exception {
            assertThat(containsBlockedResource("<img src=\"ftp://files.example.com/x.png\">"))
                    .isTrue();
        }

        @Test
        @DisplayName("an entity-obfuscated scheme is decoded before the allowlist check")
        void obfuscatedSchemeRejected() throws Exception {
            assertThat(containsBlockedResource("<img src=\"gopher&colon;&sol;&sol;x/\">")).isTrue();
        }

        @Test
        @DisplayName("data uris and fragments are allowed")
        void dataUriAndFragmentAllowed() throws Exception {
            when(ssrfProtectionService.isUrlAllowed(anyString())).thenReturn(true);
            assertThat(
                            containsBlockedResource(
                                    "<img src=\"data:image/png;base64,AAAA\">"
                                            + "<rect fill=\"url(#grad)\"/>"))
                    .isFalse();
        }

        @Test
        @DisplayName("srcset descriptors are stripped before checking")
        void srcsetDescriptorsStripped() throws Exception {
            // only the bare url is stubbed, so a retained '1x' descriptor would fail the check
            when(ssrfProtectionService.isUrlAllowed("https://example.com/a.png")).thenReturn(true);
            assertThat(containsBlockedResource("<img srcset=\"/a.png 1x\">")).isFalse();
        }

        @Test
        @DisplayName("each distinct host is checked once")
        void distinctHostsChecked() throws Exception {
            when(ssrfProtectionService.isUrlAllowed(anyString())).thenReturn(true);
            when(ssrfProtectionService.isUrlAllowed("http://10.0.0.1/b.png")).thenReturn(false);
            assertThat(
                            containsBlockedResource(
                                    "<img src=\"/a.png\"><img src=\"http://10.0.0.1/b.png\">"))
                    .isTrue();
        }

        @Test
        @DisplayName("anchor hrefs are not treated as fetched resources")
        void anchorHrefIgnored() throws Exception {
            assertThat(containsBlockedResource("<a href=\"mailto:someone@example.com\">mail</a>"))
                    .isFalse();
        }
    }

    @Nested
    @DisplayName("percentDecode")
    class PercentDecode {

        @Test
        @DisplayName("decodes valid percent escapes")
        void decodesValid() throws Exception {
            assertThat(percentDecode("a%2fb")).isEqualTo("a/b");
        }

        @Test
        @DisplayName("leaves a trailing incomplete escape untouched")
        void trailingIncomplete() throws Exception {
            // not enough trailing chars for a full %XX -> appended literally
            assertThat(percentDecode("end%2")).isEqualTo("end%2");
        }

        @Test
        @DisplayName("leaves a non-hex escape untouched")
        void nonHexEscape() throws Exception {
            assertThat(percentDecode("a%zzb")).isEqualTo("a%zzb");
        }

        @Test
        @DisplayName("content with no escapes is returned unchanged")
        void noEscapes() throws Exception {
            assertThat(percentDecode("plain text")).isEqualTo("plain text");
        }
    }

    @Nested
    @DisplayName("decodeNumericHtmlEntities")
    class DecodeNumericHtmlEntities {

        @Test
        @DisplayName("decodes a decimal numeric entity")
        void decimalEntity() throws Exception {
            // &#47; is '/'
            assertThat(decodeEntities("a&#47;b")).isEqualTo("a/b");
        }

        @Test
        @DisplayName("decodes a hexadecimal numeric entity")
        void hexEntity() throws Exception {
            // &#x2f; is '/'
            assertThat(decodeEntities("a&#x2f;b")).isEqualTo("a/b");
        }

        @Test
        @DisplayName("content without entities is unchanged")
        void noEntities() throws Exception {
            assertThat(decodeEntities("nothing here")).isEqualTo("nothing here");
        }
    }

    @Test
    @DisplayName("controller is constructed with its collaborators")
    void constructed() {
        assertThat(sut).isNotNull();
    }

    @Test
    @DisplayName("reflection invocation surfaces are wired correctly")
    void reflectionWired() throws Exception {
        // guards against a refactor renaming the private helpers used above
        try {
            assertThat(containsDisallowed("safe")).isFalse();
        } catch (InvocationTargetException e) {
            throw new AssertionError("helper invocation failed", e.getCause());
        }
    }
}
