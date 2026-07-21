package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.model.api.converters.HTMLToPdfRequest;
import stirling.software.common.util.EmlParser.EmailAttachment;
import stirling.software.common.util.EmlParser.EmailContent;

/**
 * Gap-filling tests for the HTML-generation and helper methods of {@link EmlProcessingUtils}. All
 * inputs are built in-memory; no sanitizer, network or external tool is used.
 */
class EmlProcessingUtilsMoreTest {

    private static EmailContent content(String subject, String from, String to) {
        EmailContent content = new EmailContent();
        content.setSubject(subject);
        content.setFrom(from);
        content.setTo(to);
        return content;
    }

    @Nested
    @DisplayName("generateEnhancedEmailHtml")
    class GenerateHtmlTests {

        @Test
        @DisplayName("produces a full HTML document with the subject and core headers")
        void basicDocument() {
            EmailContent content = content("My Subject", "from@x.com", "to@x.com");
            content.setTextBody("plain body text");

            String html = EmlProcessingUtils.generateEnhancedEmailHtml(content, null, null);

            assertThat(html)
                    .contains("<!DOCTYPE html>")
                    .contains("My Subject")
                    .contains("from@x.com")
                    .contains("to@x.com")
                    .contains("plain body text")
                    .contains("</body></html>");
        }

        @Test
        @DisplayName("renders CC, BCC and a formatted date when present")
        void ccBccAndDate() {
            EmailContent content = content("Sub", "from@x.com", "to@x.com");
            content.setCc("cc@x.com");
            content.setBcc("bcc@x.com");
            content.setDate(ZonedDateTime.of(2024, 5, 6, 7, 8, 0, 0, ZoneOffset.UTC));
            content.setTextBody("hi");

            String html = EmlProcessingUtils.generateEnhancedEmailHtml(content, null, null);

            assertThat(html)
                    .contains("CC:")
                    .contains("cc@x.com")
                    .contains("BCC:")
                    .contains("bcc@x.com")
                    .contains("Date:");
        }

        @Test
        @DisplayName("prefers the HTML body over the text body when both are present")
        void prefersHtmlBody() {
            EmailContent content = content("Sub", "f@x.com", "t@x.com");
            content.setHtmlBody("<p>html version</p>");
            content.setTextBody("text version");

            String html = EmlProcessingUtils.generateEnhancedEmailHtml(content, null, null);

            assertThat(html).contains("html version");
        }

        @Test
        @DisplayName("falls back to a no-content placeholder when both bodies are empty")
        void noContentPlaceholder() {
            EmailContent content = content("Sub", "f@x.com", "t@x.com");

            String html = EmlProcessingUtils.generateEnhancedEmailHtml(content, null, null);

            assertThat(html).contains("No content available");
        }

        @Test
        @DisplayName("renders an attachments section and respects includeAttachments wording")
        void attachmentsSection() {
            EmailContent content = content("Sub", "f@x.com", "t@x.com");
            content.setTextBody("body");
            EmailAttachment att = new EmailAttachment();
            att.setFilename("file.pdf");
            att.setContentType("application/pdf");
            att.setData(new byte[] {1, 2, 3});
            List<EmailAttachment> list = new ArrayList<>();
            list.add(att);
            content.setAttachments(list);
            content.setAttachmentCount(1);

            EmlToPdfRequest request = new EmlToPdfRequest();
            request.setIncludeAttachments(true);

            String html = EmlProcessingUtils.generateEnhancedEmailHtml(content, request, null);

            assertThat(html)
                    .contains("Attachments (1)")
                    .contains("file.pdf")
                    .contains("embedded in the file");
        }

        @Test
        @DisplayName("shows the not-included note when attachments are not requested")
        void attachmentsNotIncludedNote() {
            EmailContent content = content("Sub", "f@x.com", "t@x.com");
            content.setTextBody("body");
            EmailAttachment att = new EmailAttachment();
            att.setFilename("a.txt");
            List<EmailAttachment> list = new ArrayList<>();
            list.add(att);
            content.setAttachments(list);
            content.setAttachmentCount(1);

            String html = EmlProcessingUtils.generateEnhancedEmailHtml(content, null, null);

            assertThat(html).contains("files not included in PDF");
        }
    }

    @Nested
    @DisplayName("createHtmlRequest")
    class CreateHtmlRequestTests {

        @Test
        @DisplayName("copies the file input and applies the default zoom")
        void copiesFileInputAndZoom() {
            EmlToPdfRequest request = new EmlToPdfRequest();
            HTMLToPdfRequest htmlRequest = EmlProcessingUtils.createHtmlRequest(request);
            assertThat(htmlRequest).isNotNull();
            assertThat(htmlRequest.getZoom()).isEqualTo(1.0f);
        }

        @Test
        @DisplayName("tolerates a null request and still sets the zoom")
        void nullRequest() {
            HTMLToPdfRequest htmlRequest = EmlProcessingUtils.createHtmlRequest(null);
            assertThat(htmlRequest.getZoom()).isEqualTo(1.0f);
        }
    }

    @Nested
    @DisplayName("simplifyHtmlContent")
    class SimplifyHtmlTests {

        @Test
        @DisplayName("strips script and style tags")
        void stripsScriptAndStyle() {
            String html =
                    "<html><head><style>.a{}</style></head>"
                            + "<body><script>alert(1)</script><p>keep</p></body></html>";
            String result = EmlProcessingUtils.simplifyHtmlContent(html);
            assertThat(result).doesNotContain("<script").doesNotContain("<style").contains("keep");
        }
    }

    @Nested
    @DisplayName("decodeMimeHeader - quoted-printable charset handling")
    class DecodeMimeHeaderTests {

        @Test
        @DisplayName("decodes a quoted-printable hex sequence into the right characters")
        void decodesQpHex() {
            // =E9 in ISO-8859-1 is 'é'.
            String result = EmlProcessingUtils.decodeMimeHeader("=?ISO-8859-1?Q?caf=E9?=");
            assertThat(result).isEqualTo("café");
        }

        @Test
        @DisplayName("an unknown charset falls back without throwing")
        void unknownCharsetFallback() {
            String result = EmlProcessingUtils.decodeMimeHeader("=?MADE-UP-CHARSET?B?SGVsbG8=?=");
            assertThat(result).isNotNull();
        }
    }

    @Nested
    @DisplayName("convertTextToHtml - sanitizer-less escaping")
    class ConvertTextToHtmlTests {

        @Test
        @DisplayName("escapes HTML special characters when no sanitizer is supplied")
        void escapesSpecialChars() {
            String result = EmlProcessingUtils.convertTextToHtml("a <b> & c", null);
            assertThat(result).contains("&lt;b&gt;").contains("&amp;");
        }
    }

    @Nested
    @DisplayName("detectMimeType - extension table")
    class DetectMimeTypeTests {

        @Test
        @DisplayName("detects svg, bmp and webp from the filename")
        void detectsExtraTypes() {
            assertThat(EmlProcessingUtils.detectMimeType("a.svg", null)).isEqualTo("image/svg+xml");
            assertThat(EmlProcessingUtils.detectMimeType("a.bmp", null)).isEqualTo("image/bmp");
            assertThat(EmlProcessingUtils.detectMimeType("a.webp", null)).isEqualTo("image/webp");
        }
    }
}
