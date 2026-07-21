package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.ZonedDateTime;
import java.util.Base64;
import java.util.Locale;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.util.EmlParser.EmailAttachment;
import stirling.software.common.util.EmlParser.EmailContent;

/**
 * Gap-filling tests for {@link EmlParser#extractEmailContent} driven by small real .eml strings.
 * These exercise the content-building, recipient-formatting and attachment-mapping branches plus
 * the nested {@link EmailContent}/{@link EmailAttachment} value types. No network or external tool.
 */
class EmlParserMoreTest {

    private static final String TS = "Mon, 01 Jan 2024 12:00:00 +0000";

    private static byte[] eml(String content) {
        return content.getBytes(StandardCharsets.UTF_8);
    }

    private static EmlToPdfRequest requestWithAttachments(int maxMb) {
        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setIncludeAttachments(true);
        request.setMaxAttachmentSizeMB(maxMb);
        return request;
    }

    private static String simpleText(String from, String to, String subject, String body) {
        return String.format(
                Locale.ROOT,
                "From: %s\nTo: %s\nSubject: %s\nDate: %s\n"
                        + "Content-Type: text/plain; charset=UTF-8\n"
                        + "Content-Transfer-Encoding: 8bit\n\n%s",
                from,
                to,
                subject,
                TS,
                body);
    }

    private static String multipartWithAttachment(
            String boundary, String body, String filename, String attachmentContent) {
        String encoded =
                Base64.getEncoder()
                        .encodeToString(attachmentContent.getBytes(StandardCharsets.UTF_8));
        return String.format(
                Locale.ROOT,
                "From: a@example.com\nTo: b@example.com\nCc: c@example.com\n"
                        + "Subject: Multipart\nDate: %s\n"
                        + "Content-Type: multipart/mixed; boundary=\"%s\"\n\n"
                        + "--%s\nContent-Type: text/plain; charset=UTF-8\n"
                        + "Content-Transfer-Encoding: 8bit\n\n%s\n\n"
                        + "--%s\nContent-Type: text/plain; charset=UTF-8\n"
                        + "Content-Disposition: attachment; filename=\"%s\"\n"
                        + "Content-Transfer-Encoding: base64\n\n%s\n\n--%s--",
                TS,
                boundary,
                boundary,
                body,
                boundary,
                filename,
                encoded,
                boundary);
    }

    @Nested
    @DisplayName("extractEmailContent - headers and bodies")
    class HeaderTests {

        @Test
        @DisplayName("subject, from, to and plain-text body are extracted")
        void plainTextEmail() throws Exception {
            EmailContent content =
                    EmlParser.extractEmailContent(
                            eml(
                                    simpleText(
                                            "sender@example.com",
                                            "recipient@example.com",
                                            "Hello Subject",
                                            "Body line one")),
                            null,
                            null);

            assertThat(content.getSubject()).isEqualTo("Hello Subject");
            assertThat(content.getFrom()).contains("sender@example.com");
            assertThat(content.getTo()).contains("recipient@example.com");
            assertThat(content.getTextBody()).contains("Body line one");
        }

        @Test
        @DisplayName("the sent date is parsed into a UTC ZonedDateTime")
        void parsesDate() throws Exception {
            EmailContent content =
                    EmlParser.extractEmailContent(
                            eml(simpleText("a@x.com", "b@x.com", "Dated", "hi")), null, null);
            ZonedDateTime date = content.getDate();
            assertThat(date).isNotNull();
            assertThat(date.getYear()).isEqualTo(2024);
        }

        @Test
        @DisplayName("an HTML body is captured as the html body")
        void htmlBodyCaptured() throws Exception {
            String html =
                    String.format(
                            Locale.ROOT,
                            "From: a@x.com\nTo: b@x.com\nSubject: HtmlMail\nDate: %s\n"
                                    + "Content-Type: text/html; charset=UTF-8\n"
                                    + "Content-Transfer-Encoding: 8bit\n\n"
                                    + "<html><body><p>Rich</p></body></html>",
                            TS);

            EmailContent content = EmlParser.extractEmailContent(eml(html), null, null);
            assertThat(content.getHtmlBody()).contains("Rich");
        }
    }

    @Nested
    @DisplayName("extractEmailContent - attachments")
    class AttachmentTests {

        @Test
        @DisplayName("attachment metadata is mapped and CC recipients are formatted")
        void attachmentMappedAndCc() throws Exception {
            EmailContent content =
                    EmlParser.extractEmailContent(
                            eml(
                                    multipartWithAttachment(
                                            "----b1",
                                            "see attached",
                                            "notes.txt",
                                            "attachment payload")),
                            requestWithAttachments(10),
                            null);

            assertThat(content.getCc()).contains("c@example.com");
            assertThat(content.getAttachmentCount()).isGreaterThanOrEqualTo(1);
            EmailAttachment att = content.getAttachments().get(0);
            assertThat(att.getFilename()).isEqualTo("notes.txt");
            assertThat(att.getData()).isNotNull();
        }

        @Test
        @DisplayName("when attachments are not requested the data bytes are omitted")
        void attachmentDataOmittedWhenNotRequested() throws Exception {
            EmlToPdfRequest noAttach = new EmlToPdfRequest();
            noAttach.setIncludeAttachments(false);

            EmailContent content =
                    EmlParser.extractEmailContent(
                            eml(
                                    multipartWithAttachment(
                                            "----b2", "body", "doc.txt", "some content")),
                            noAttach,
                            null);

            // Metadata still present, but the raw bytes are not attached.
            assertThat(content.getAttachmentCount()).isGreaterThanOrEqualTo(1);
            assertThat(content.getAttachments().get(0).getData()).isNull();
        }

        @Test
        @DisplayName("an attachment over the size limit has its data skipped")
        void attachmentOverSizeLimitSkipped() throws Exception {
            // 0 MB limit means any non-empty attachment exceeds it.
            EmailContent content =
                    EmlParser.extractEmailContent(
                            eml(
                                    multipartWithAttachment(
                                            "----b3",
                                            "body",
                                            "big.txt",
                                            "this content exceeds the zero-byte limit")),
                            requestWithAttachments(0),
                            null);

            assertThat(content.getAttachments().get(0).getData()).isNull();
        }
    }

    @Nested
    @DisplayName("extractEmailContent - failure paths")
    class FailureTests {

        @Test
        @DisplayName("OLE2 magic bytes that are not a real MSG file raise an IOException")
        void fakeMsgFile() {
            // OLE2/MSG magic prefix followed by garbage -> outlookMsgToEmail fails.
            byte[] fakeMsg = {
                (byte) 0xD0,
                (byte) 0xCF,
                (byte) 0x11,
                (byte) 0xE0,
                (byte) 0xA1,
                (byte) 0xB1,
                (byte) 0x1A,
                (byte) 0xE1,
                0x00,
                0x01,
                0x02,
                0x03,
                0x04,
                0x05,
                0x06,
                0x07
            };
            assertThatThrownBy(() -> EmlParser.extractEmailContent(fakeMsg, null, null))
                    .isInstanceOf(java.io.IOException.class);
        }
    }

    @Nested
    @DisplayName("EmailContent value type")
    class EmailContentTests {

        @Test
        @DisplayName("setHtmlBody and setTextBody strip carriage returns")
        void stripsCarriageReturns() throws Exception {
            EmailContent content =
                    EmlParser.extractEmailContent(
                            eml(simpleText("a@x.com", "b@x.com", "s", "x")), null, null);
            content.setHtmlBody("line1\r\nline2");
            content.setTextBody("a\r\nb");
            assertThat(content.getHtmlBody()).doesNotContain("\r");
            assertThat(content.getTextBody()).doesNotContain("\r");
        }

        @Test
        @DisplayName("null bodies are preserved as null")
        void nullBodiesPreserved() throws Exception {
            EmailContent content =
                    EmlParser.extractEmailContent(
                            eml(simpleText("a@x.com", "b@x.com", "s", "x")), null, null);
            content.setHtmlBody(null);
            assertThat(content.getHtmlBody()).isNull();
        }
    }

    @Nested
    @DisplayName("EmailAttachment value type")
    class EmailAttachmentTests {

        @Test
        @DisplayName("setData updates the size in bytes")
        void setDataUpdatesSize() {
            EmailAttachment att = new EmailAttachment();
            att.setData(new byte[] {1, 2, 3, 4, 5});
            assertThat(att.getSizeBytes()).isEqualTo(5);
        }

        @Test
        @DisplayName("setData with null leaves size unchanged")
        void setDataNull() {
            EmailAttachment att = new EmailAttachment();
            att.setData(null);
            assertThat(att.getSizeBytes()).isZero();
        }
    }
}
