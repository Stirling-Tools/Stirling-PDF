package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class CustomHtmlSanitizerTest {

    @ParameterizedTest
    @MethodSource("provideHtmlTestCases")
    void testSanitizeHtml(String inputHtml, String[] expectedContainedTags) {
        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(inputHtml);

        // Assert
        for (String tag : expectedContainedTags) {
            assertTrue(sanitizedHtml.contains(tag), tag + " should be preserved");
        }
    }

    private static Stream<Arguments> provideHtmlTestCases() {
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
    void testSanitizeAllowsStyles() {
        // Arrange - Testing Sanitizers.STYLES
        String htmlWithStyles =
                "<p style=\"color: blue; font-size: 16px; margin-top: 10px;\">Styled text</p>";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithStyles);

        // Assert
        // The OWASP HTML Sanitizer might filter some specific styles, so we only check that
        // the sanitized HTML is not empty and contains a paragraph tag with style
        assertTrue(sanitizedHtml.contains("<p"), "Paragraph tag should be preserved");
        assertTrue(sanitizedHtml.contains("style="), "Style attribute should be preserved");
        assertTrue(sanitizedHtml.contains("Styled text"), "Content should be preserved");
    }

    @Test
    void testSanitizeAllowsLinks() {
        // Arrange - Testing Sanitizers.LINKS
        String htmlWithLink =
                "<a href=\"https://example.com\" title=\"Example Site\">Example Link</a>";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithLink);

        // Assert
        // The most important aspect is that the link content is preserved
        assertTrue(sanitizedHtml.contains("Example Link"), "Link text should be preserved");

        // Check that the href is present in some form
        assertTrue(sanitizedHtml.contains("href="), "Link href attribute should be present");

        // Check that the URL is present in some form
        assertTrue(sanitizedHtml.contains("example.com"), "Link URL should be preserved");

        // OWASP sanitizer may handle title attributes differently depending on version
        // So we won't make strict assertions about the title attribute
    }

    @Test
    void testSanitizeDisallowsJavaScriptLinks() {
        // Arrange
        String htmlWithJsLink = "<a href=\"javascript:alert('XSS')\">Malicious Link</a>";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithJsLink);

        // Assert
        assertFalse(sanitizedHtml.contains("javascript:"), "JavaScript URLs should be removed");
        // The link tag might still be there, but the href should be sanitized
        assertTrue(sanitizedHtml.contains("Malicious Link"), "Link text should be preserved");
    }

    @Test
    void testSanitizeAllowsTables() {
        // Arrange - Testing Sanitizers.TABLES
        String htmlWithTable =
                "<table border=\"1\">"
                        + "<thead><tr><th>Header 1</th><th>Header 2</th></tr></thead>"
                        + "<tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody>"
                        + "<tfoot><tr><td colspan=\"2\">Footer</td></tr></tfoot>"
                        + "</table>";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithTable);

        // Assert
        assertTrue(sanitizedHtml.contains("<table"), "Table should be preserved");
        assertTrue(sanitizedHtml.contains("<tr>"), "Table rows should be preserved");
        assertTrue(sanitizedHtml.contains("<th>"), "Table headers should be preserved");
        assertTrue(sanitizedHtml.contains("<td>"), "Table cells should be preserved");
        // Note: border attribute might be removed as it's deprecated in HTML5

        // Check for content values instead of exact tag formats because
        // the sanitizer may normalize tags and attributes
        assertTrue(sanitizedHtml.contains("Header 1"), "Table header content should be preserved");
        assertTrue(sanitizedHtml.contains("Cell 1"), "Table cell content should be preserved");
        assertTrue(sanitizedHtml.contains("Footer"), "Table footer content should be preserved");

        // OWASP sanitizer may not preserve these structural elements or attributes in the same
        // format
        // So we check for the content rather than the exact structure
    }

    @Test
    void testSanitizeAllowsImages() {
        // Arrange - Testing Sanitizers.IMAGES
        String htmlWithImage =
                "<img src=\"image.jpg\" alt=\"An image\" width=\"100\" height=\"100\">";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithImage);

        // Assert
        assertTrue(sanitizedHtml.contains("<img"), "Image tag should be preserved");
        assertTrue(sanitizedHtml.contains("src=\"image.jpg\""), "Image source should be preserved");
        assertTrue(
                sanitizedHtml.contains("alt=\"An image\""), "Image alt text should be preserved");
        // Width and height might be preserved, but not guaranteed by all sanitizers
    }

    @Test
    void testSanitizeDisallowsDataUrlImages() {
        // Arrange
        String htmlWithDataUrlImage =
                "<img src=\"data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=\" alt=\"SVG with XSS\">";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithDataUrlImage);

        // Assert
        assertFalse(
                sanitizedHtml.contains("data:image/svg"),
                "Data URLs with potentially malicious content should be removed");
    }

    @Test
    void testSanitizeRemovesJavaScriptInAttributes() {
        // Arrange
        String htmlWithJsEvent =
                "<a href=\"#\" onclick=\"alert('XSS')\" onmouseover=\"alert('XSS')\">Click me</a>";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithJsEvent);

        // Assert
        assertFalse(
                sanitizedHtml.contains("onclick"), "JavaScript event handlers should be removed");
        assertFalse(
                sanitizedHtml.contains("onmouseover"),
                "JavaScript event handlers should be removed");
        assertTrue(sanitizedHtml.contains("Click me"), "Link text should be preserved");
    }

    @Test
    void testSanitizeRemovesScriptTags() {
        // Arrange
        String htmlWithScript = "<p>Safe content</p><script>alert('XSS');</script>";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithScript);

        // Assert
        assertFalse(sanitizedHtml.contains("<script>"), "Script tags should be removed");
        assertTrue(
                sanitizedHtml.contains("<p>Safe content</p>"), "Safe content should be preserved");
    }

    @Test
    void testSanitizeRemovesNoScriptTags() {
        // Arrange - Testing the custom policy to disallow noscript
        String htmlWithNoscript = "<p>Safe content</p><noscript>JavaScript is disabled</noscript>";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithNoscript);

        // Assert
        assertFalse(sanitizedHtml.contains("<noscript>"), "Noscript tags should be removed");
        assertTrue(
                sanitizedHtml.contains("<p>Safe content</p>"), "Safe content should be preserved");
    }

    @Test
    void testSanitizeRemovesIframes() {
        // Arrange
        String htmlWithIframe = "<p>Safe content</p><iframe src=\"https://example.com\"></iframe>";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithIframe);

        // Assert
        assertFalse(sanitizedHtml.contains("<iframe"), "Iframe tags should be removed");
        assertTrue(
                sanitizedHtml.contains("<p>Safe content</p>"), "Safe content should be preserved");
    }

    @Test
    void testSanitizeRemovesObjectAndEmbed() {
        // Arrange
        String htmlWithObjects =
                "<p>Safe content</p>"
                        + "<object data=\"data.swf\" type=\"application/x-shockwave-flash\"></object>"
                        + "<embed src=\"embed.swf\" type=\"application/x-shockwave-flash\">";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithObjects);

        // Assert
        assertFalse(sanitizedHtml.contains("<object"), "Object tags should be removed");
        assertFalse(sanitizedHtml.contains("<embed"), "Embed tags should be removed");
        assertTrue(
                sanitizedHtml.contains("<p>Safe content</p>"), "Safe content should be preserved");
    }

    @Test
    void testSanitizeRemovesMetaAndBaseAndLink() {
        // Arrange
        String htmlWithMetaTags =
                "<p>Safe content</p>"
                        + "<meta http-equiv=\"refresh\" content=\"0; url=http://evil.com\">"
                        + "<base href=\"http://evil.com/\">"
                        + "<link rel=\"stylesheet\" href=\"evil.css\">";

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(htmlWithMetaTags);

        // Assert
        assertFalse(sanitizedHtml.contains("<meta"), "Meta tags should be removed");
        assertFalse(sanitizedHtml.contains("<base"), "Base tags should be removed");
        assertFalse(sanitizedHtml.contains("<link"), "Link tags should be removed");
        assertTrue(
                sanitizedHtml.contains("<p>Safe content</p>"), "Safe content should be preserved");
    }

    @Test
    void testSanitizeHandlesComplexHtml() {
        // Arrange
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

        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(complexHtml);

        // Assert
        assertTrue(sanitizedHtml.contains("<div"), "Div should be preserved");
        assertTrue(sanitizedHtml.contains("<h1"), "H1 should be preserved");
        assertTrue(
                sanitizedHtml.contains("<strong>") && sanitizedHtml.contains("test"),
                "Strong tag should be preserved");

        // Check for content rather than exact formatting
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

        // Content checks
        assertTrue(sanitizedHtml.contains("Welcome"), "Heading content should be preserved");
        assertTrue(sanitizedHtml.contains("Name"), "Table header content should be preserved");
        assertTrue(sanitizedHtml.contains("Item 1"), "Table data content should be preserved");
    }

    @Test
    void testSanitizeHandlesEmpty() {
        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize("");

        // Assert
        assertEquals("", sanitizedHtml, "Empty input should result in empty string");
    }

    @Test
    void testSanitizeHandlesNull() {
        // Act
        String sanitizedHtml = CustomHtmlSanitizer.sanitize(null);

        // Assert
        assertEquals("", sanitizedHtml, "Null input should result in empty string");
    }
}
