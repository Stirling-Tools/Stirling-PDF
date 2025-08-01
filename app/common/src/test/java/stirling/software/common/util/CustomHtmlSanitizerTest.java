package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.stream.Stream;

import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import stirling.software.common.service.SsrfProtectionService;

@DisplayName("CustomHtmlSanitizer Tests")
class CustomHtmlSanitizerTest {

    private CustomHtmlSanitizer customHtmlSanitizer;

    @BeforeEach
    void setUp() {
        SsrfProtectionService mockSsrfProtectionService = mock(SsrfProtectionService.class);
        stirling.software.common.model.ApplicationProperties mockApplicationProperties =
                mock(stirling.software.common.model.ApplicationProperties.class);
        stirling.software.common.model.ApplicationProperties.System mockSystem =
                mock(stirling.software.common.model.ApplicationProperties.System.class);

        // Allow all URLs by default for basic tests
        when(mockSsrfProtectionService.isUrlAllowed(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(true);
        when(mockApplicationProperties.getSystem()).thenReturn(mockSystem);
        when(mockSystem.getDisableSanitize()).thenReturn(false);

        customHtmlSanitizer =
                new CustomHtmlSanitizer(mockSsrfProtectionService, mockApplicationProperties);
    }

    @TestInstance(TestInstance.Lifecycle.PER_CLASS)
    @Nested
    @DisplayName("Tag Preservation Tests")
    class TagPreservationTests {
        @ParameterizedTest(name = "should preserve tags: {1}")
        @MethodSource("provideHtmlTestCases")
        void testSanitizeHtml(String inputHtml, String[] expectedContainedTags) {
            String sanitizedHtml = customHtmlSanitizer.sanitize(inputHtml);
            for (String tag : expectedContainedTags) {
                assertTrue(sanitizedHtml.contains(tag), tag + " should be preserved");
            }
        }

        private Stream<Arguments> provideHtmlTestCases() {
            return Stream.of(
                    Arguments.of(
                            "<p>This is <strong>valid</strong> HTML with <em>formatting</em>.</p>",
                            new String[] {"<p>", "<strong>", "<em>"}),
                    Arguments.of(
                            "<p>Text with <b>bold</b>, <i>italic</i>, <u>underline</u>, "
                                    + "<em>emphasis</em>, <strong>strong</strong>, <strike>strikethrough</strike>, "
                                    + "<s>strike</s>, <sub>subscript</sub>, <sup>superscript</sup>, "
                                    + "<tt>teletype</tt>, <code>code</code>, <big>big</big>, <small>small</small>.</p>",
                            new String[] {
                                "<b>bold</b>",
                                "<i>italic</i>",
                                "<em>emphasis</em>",
                                "<strong>strong</strong>"
                            }),
                    Arguments.of(
                            "<div>Division</div><h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3>"
                                    + "<h4>Heading 4</h4><h5>Heading 5</h5><h6>Heading 6</h6>"
                                    + "<blockquote>Blockquote</blockquote><ul><li>List item</li></ul>"
                                    + "<ol><li>Ordered item</li></ol>",
                            new String[] {
                                "<div>", "<h1>", "<h6>", "<blockquote>", "<ul>", "<ol>", "<li>"
                            }));
        }

        @Test
        @DisplayName("Allows style attributes")
        void testSanitizeAllowsStyles() {
            String htmlWithStyles =
                    "<p style=\"color: blue; font-size: 16px; margin-top: 10px;\">Styled text</p>";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithStyles);
            assertTrue(sanitizedHtml.contains("<p"), "Paragraph tag should be preserved");
            assertTrue(sanitizedHtml.contains("style="), "Style attribute should be preserved");
            assertTrue(sanitizedHtml.contains("Styled text"), "Content should be preserved");
        }

        @Test
        @DisplayName("Allows safe links")
        void testSanitizeAllowsLinks() {
            String htmlWithLink =
                    "<a href=\"https://example.com\" title=\"Example Site\">Example Link</a>";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithLink);

            assertTrue(sanitizedHtml.contains("Example Link"), "Link text should be preserved");
            assertTrue(sanitizedHtml.contains("href="), "Link href attribute should be present");
            assertTrue(sanitizedHtml.contains("example.com"), "Link URL should be preserved");
        }

        @Test
        @DisplayName("Allows tables")
        void testSanitizeAllowsTables() {
            String htmlWithTable =
                    "<table border=\"1\">"
                            + "<thead><tr><th>Header 1</th><th>Header 2</th></tr></thead>"
                            + "<tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody>"
                            + "<tfoot><tr><td colspan=\"2\">Footer</td></tr></tfoot>"
                            + "</table>";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithTable);
            assertTrue(sanitizedHtml.contains("<table"), "Table should be preserved");
            assertTrue(sanitizedHtml.contains("<tr>"), "Table rows should be preserved");
            assertTrue(sanitizedHtml.contains("<th>"), "Table headers should be preserved");
            assertTrue(sanitizedHtml.contains("<td>"), "Table cells should be preserved");
            assertTrue(
                    sanitizedHtml.contains("Header 1"), "Table header content should be preserved");
            assertTrue(sanitizedHtml.contains("Cell 1"), "Table cell content should be preserved");
            assertTrue(
                    sanitizedHtml.contains("Footer"), "Table footer content should be preserved");
        }

        @Test
        @DisplayName("Allows images")
        void testSanitizeAllowsImages() {
            String htmlWithImage =
                    "<img src=\"image.jpg\" alt=\"An image\" width=\"100\" height=\"100\">";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithImage);
            assertTrue(sanitizedHtml.contains("<img"), "Image tag should be preserved");
            assertTrue(
                    sanitizedHtml.contains("src=\"image.jpg\""),
                    "Image source should be preserved");
            assertTrue(
                    sanitizedHtml.contains("alt=\"An image\""),
                    "Image alt text should be preserved");
        }
    }

    @Nested
    @DisplayName("Tag/Attribute Removal and XSS Tests")
    class TagAndXssPreventionTests {
        @Test
        @DisplayName("Removes JavaScript URLs from href")
        void testSanitizeDisallowsJavaScriptLinks() {
            String htmlWithJsLink = "<a href=\"javascript:alert('XSS')\">Malicious Link</a>";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithJsLink);
            assertFalse(sanitizedHtml.contains("javascript:"), "JavaScript URLs should be removed");
            assertTrue(sanitizedHtml.contains("Malicious Link"), "Link text should be preserved");
        }

        @Test
        @DisplayName("Removes data URL images")
        void testSanitizeDisallowsDataUrlImages() {
            String htmlWithDataUrlImage =
                    "<img src=\"data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=\" alt=\"SVG with XSS\">";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithDataUrlImage);
            assertFalse(
                    sanitizedHtml.contains("data:image/svg"),
                    "Data URLs with potentially malicious content should be removed");
        }

        @Test
        @DisplayName("Removes JS event handler attributes")
        void testSanitizeRemovesJavaScriptInAttributes() {
            String htmlWithJsEvent =
                    "<a href=\"#\" onclick=\"alert('XSS')\" onmouseover=\"alert('XSS')\">Click me</a>";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithJsEvent);
            assertFalse(
                    sanitizedHtml.contains("onclick"),
                    "JavaScript event handlers should be removed");
            assertFalse(
                    sanitizedHtml.contains("onmouseover"),
                    "JavaScript event handlers should be removed");
            assertTrue(sanitizedHtml.contains("Click me"), "Link text should be preserved");
        }

        @Test
        @DisplayName("Removes <script> tags")
        void testSanitizeRemovesScriptTags() {
            String htmlWithScript = "<p>Safe content</p><script>alert('XSS');</script>";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithScript);
            assertFalse(sanitizedHtml.contains("<script>"), "Script tags should be removed");
            assertTrue(
                    sanitizedHtml.contains("<p>Safe content</p>"),
                    "Safe content should be preserved");
        }

        @Test
        @DisplayName("Removes <noscript> tags")
        void testSanitizeRemovesNoScriptTags() {
            String htmlWithNoscript =
                    "<p>Safe content</p><noscript>JavaScript is disabled</noscript>";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithNoscript);
            assertFalse(sanitizedHtml.contains("<noscript>"), "Noscript tags should be removed");
            assertTrue(
                    sanitizedHtml.contains("<p>Safe content</p>"),
                    "Safe content should be preserved");
        }

        @Test
        @DisplayName("Removes <iframe> tags")
        void testSanitizeRemovesIframes() {
            String htmlWithIframe =
                    "<p>Safe content</p><iframe src=\"https://example.com\"></iframe>";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithIframe);
            assertFalse(sanitizedHtml.contains("<iframe"), "Iframe tags should be removed");
            assertTrue(
                    sanitizedHtml.contains("<p>Safe content</p>"),
                    "Safe content should be preserved");
        }

        @Test
        @DisplayName("Removes <object> and <embed> tags")
        void testSanitizeRemovesObjectAndEmbed() {
            String htmlWithObjects =
                    "<p>Safe content</p>"
                            + "<object data=\"data.swf\" type=\"application/x-shockwave-flash\"></object>"
                            + "<embed src=\"embed.swf\" type=\"application/x-shockwave-flash\">";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithObjects);
            assertFalse(sanitizedHtml.contains("<object"), "Object tags should be removed");
            assertFalse(sanitizedHtml.contains("<embed"), "Embed tags should be removed");
            assertTrue(
                    sanitizedHtml.contains("<p>Safe content</p>"),
                    "Safe content should be preserved");
        }

        @Test
        @DisplayName("Removes <meta>, <base>, and <link> tags")
        void testSanitizeRemovesMetaAndBaseAndLink() {
            String htmlWithMetaTags =
                    "<p>Safe content</p>"
                            + "<meta http-equiv=\"refresh\" content=\"0; url=http://evil.com\">"
                            + "<base href=\"http://evil.com/\">"
                            + "<link rel=\"stylesheet\" href=\"evil.css\">";
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlWithMetaTags);
            assertFalse(sanitizedHtml.contains("<meta"), "Meta tags should be removed");
            assertFalse(sanitizedHtml.contains("<base"), "Base tags should be removed");
            assertFalse(sanitizedHtml.contains("<link"), "Link tags should be removed");
            assertTrue(
                    sanitizedHtml.contains("<p>Safe content</p>"),
                    "Safe content should be preserved");
        }
    }

    @Nested
    @DisplayName("Complex and Edge Case Tests")
    class ComplexAndEdgeCaseTests {

        @Test
        @DisplayName(
                "Handles complex HTML structures by preserving safe elements and removing unsafe ones")
        void testSanitizeHandlesComplexHtml() {
            String complexHtml =
                    "<div class=\"container\">"
                            + "  <h1 style=\"color: blue;\">Welcome</h1>"
                            + "  <p>This is a <strong>test</strong> with <a href=\"https://example.com\">link</a>.</p>"
                            + "  <table>"
                            + "    <tr><th>Name</th><th>Value</th></tr>"
                            + "    <tr><td>Item 1</td><td>100</td></tr>"
                            + "  </table>"
                            + "  <img src=\"image.jpg\" alt=\"Test image\">"
                            + "  <script>alert('XSS');</script>"
                            + "  <iframe src=\"https://evil.com\"></iframe>"
                            + "</div>";

            String sanitizedHtml = customHtmlSanitizer.sanitize(complexHtml);
            assertTrue(sanitizedHtml.contains("<div"), "Div should be preserved");
            assertTrue(sanitizedHtml.contains("<h1"), "H1 should be preserved");
            assertTrue(
                    sanitizedHtml.contains("<strong>") && sanitizedHtml.contains("test"),
                    "Strong tag should be preserved");
            assertTrue(
                    sanitizedHtml.contains("<a")
                            && sanitizedHtml.contains("href=")
                            && sanitizedHtml.contains("example.com")
                            && sanitizedHtml.contains("link"),
                    "Link should be preserved");
            assertTrue(sanitizedHtml.contains("<table"), "Table should be preserved");
            assertTrue(sanitizedHtml.contains("<img"), "Image should be preserved");
            assertFalse(sanitizedHtml.contains("<script>"), "Script tag should be removed");
            assertFalse(sanitizedHtml.contains("<iframe"), "Iframe tag should be removed");
            assertTrue(sanitizedHtml.contains("Welcome"), "Heading content should be preserved");
            assertTrue(sanitizedHtml.contains("Name"), "Table header content should be preserved");
            assertTrue(sanitizedHtml.contains("Item 1"), "Table data content should be preserved");
        }

        @Test
        @DisplayName("Returns empty string for empty input")
        void testSanitizeHandlesEmpty() {
            String sanitizedHtml = customHtmlSanitizer.sanitize("");
            assertEquals("", sanitizedHtml, "Empty input should result in empty string");
        }

        @Test
        @DisplayName("Returns empty string for null input")
        void testSanitizeHandlesNull() {
            String sanitizedHtml = customHtmlSanitizer.sanitize(null);
            assertEquals("", sanitizedHtml, "Null input should result in empty string");
        }
    }
}
