package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.ZonedDateTime;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.apache.poi.util.LittleEndian;
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
    @DisplayName("attachment filename length")
    class FilenameLengthTests {

        @Test
        @DisplayName("a long name is shortened and keeps a short extension")
        void longNameKeepsExtension() {
            EmailAttachment att = new EmailAttachment();
            att.setFilename("a".repeat(400) + ".pdf");
            assertThat(att.getFilename()).hasSize(255).endsWith(".pdf");
        }

        @Test
        @DisplayName("a long extension is not preserved")
        void longExtensionDropped() {
            EmailAttachment att = new EmailAttachment();
            att.setFilename("a".repeat(300) + "." + "b".repeat(40));
            assertThat(att.getFilename()).hasSize(255).doesNotContain(".");
        }

        @Test
        @DisplayName("shortening never splits a surrogate pair")
        void surrogatePairKept() {
            EmailAttachment att = new EmailAttachment();
            att.setFilename("\uD83D\uDE00".repeat(200));
            String name = att.getFilename();
            assertThat(name.length()).isLessThanOrEqualTo(255);
            assertThat(Character.isHighSurrogate(name.charAt(name.length() - 1))).isFalse();
        }

        @Test
        @DisplayName("short names and null pass through unchanged")
        void shortNameUnchanged() {
            EmailAttachment att = new EmailAttachment();
            att.setFilename("notes.txt");
            assertThat(att.getFilename()).isEqualTo("notes.txt");
            att.setFilename(null);
            assertThat(att.getFilename()).isNull();
        }

        @Test
        @DisplayName("a long name in a Content-Disposition header is shortened on parse")
        void parsedNameShortened() throws Exception {
            EmailContent content =
                    EmlParser.extractEmailContent(
                            eml(
                                    multipartWithAttachment(
                                            "----b9", "body", "n".repeat(600) + ".txt", "x")),
                            requestWithAttachments(10),
                            null);
            assertThat(content.getAttachments().get(0).getFilename()).hasSize(255).endsWith(".txt");
        }
    }

    @Nested
    @DisplayName("extractEmailContent - MSG files")
    class MsgTests {

        private static final int DIRECTORY_ENTRY_SIZE = 128;
        private static final int ENTRY_NAME_LENGTH_OFFSET = 64;
        private static final int ENTRY_START_SECTOR_OFFSET = 116;
        private static final int ENTRY_SIZE_OFFSET = 120;

        private static byte[] compoundFile(Map<String, Integer> streamSizes) throws Exception {
            try (POIFSFileSystem fs = new POIFSFileSystem();
                    ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                for (Map.Entry<String, Integer> e : streamSizes.entrySet()) {
                    fs.getRoot()
                            .createDocument(
                                    e.getKey(), new ByteArrayInputStream(new byte[e.getValue()]));
                }
                fs.writeFilesystem(out);
                return out.toByteArray();
            }
        }

        /** Offset of the named directory entry; the directory fits in one sector. */
        private static int directoryEntryOffset(byte[] file, String name) {
            int sectorSize = 1 << LittleEndian.getShort(file, 30);
            int directoryStartSector = LittleEndian.getInt(file, 48);
            int base = sectorSize + directoryStartSector * sectorSize;
            for (int i = 0; i < sectorSize / DIRECTORY_ENTRY_SIZE; i++) {
                int offset = base + i * DIRECTORY_ENTRY_SIZE;
                int nameBytes = LittleEndian.getShort(file, offset + ENTRY_NAME_LENGTH_OFFSET);
                if (nameBytes < 2) continue;
                String entryName =
                        new String(file, offset, nameBytes - 2, StandardCharsets.UTF_16LE);
                if (entryName.equals(name)) return offset;
            }
            throw new IllegalStateException("no directory entry named " + name);
        }

        private static Map<String, Integer> streams(String n1, int s1, String n2, int s2) {
            Map<String, Integer> m = new LinkedHashMap<>();
            m.put(n1, s1);
            m.put(n2, s2);
            return m;
        }

        @Test
        @DisplayName("a well-formed MSG parses")
        void wellFormedMsgParses() throws Exception {
            byte[] msg;
            try (InputStream in = getClass().getResourceAsStream("/eml/example.msg")) {
                assertThat(in).isNotNull();
                msg = in.readAllBytes();
            }
            EmailContent content = EmlParser.extractEmailContent(msg, null, null);
            assertThat(content).isNotNull();
            assertThat(content.getSubject()).isNotNull();
        }

        @Test
        @DisplayName("two directory entries pointing at the same data are rejected")
        void sharedStreamDataRejected() throws Exception {
            byte[] file =
                    compoundFile(
                            streams("__substg1.0_37010102", 100_000, "__substg1.0_3707001F", 10));
            int big = directoryEntryOffset(file, "__substg1.0_37010102");
            int small = directoryEntryOffset(file, "__substg1.0_3707001F");
            System.arraycopy(
                    file,
                    big + ENTRY_START_SECTOR_OFFSET,
                    file,
                    small + ENTRY_START_SECTOR_OFFSET,
                    8);

            assertThatThrownBy(() -> EmlParser.extractEmailContent(file, null, null))
                    .isInstanceOf(java.io.IOException.class)
                    .hasMessageContaining("more data than the file contains");
        }

        @Test
        @DisplayName("a negative stream size is rejected")
        void negativeStreamSizeRejected() throws Exception {
            byte[] file =
                    compoundFile(
                            streams("__substg1.0_37010102", 5_000, "__substg1.0_3707001F", 10));
            int small = directoryEntryOffset(file, "__substg1.0_3707001F");
            LittleEndian.putInt(file, small + ENTRY_SIZE_OFFSET, -1);

            assertThatThrownBy(() -> EmlParser.extractEmailContent(file, null, null))
                    .isInstanceOf(java.io.IOException.class);
        }

        @Test
        @DisplayName("an oversized property stream is rejected")
        void oversizedPropertyStreamRejected() throws Exception {
            byte[] file =
                    compoundFile(
                            streams("__properties_version1.0", 70_000, "__substg1.0_3707001F", 10));

            assertThatThrownBy(() -> EmlParser.extractEmailContent(file, null, null))
                    .isInstanceOf(java.io.IOException.class)
                    .hasMessageContaining("property stream");
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

        @Test
        @DisplayName("more attachments than allowed raises an IOException only when embedding")
        void tooManyAttachments() throws Exception {
            StringBuilder content =
                    new StringBuilder(
                            "From: a@example.com\nTo: b@example.com\nSubject: Many\n"
                                    + "Content-Type: multipart/mixed; boundary=\"b\"\n\n"
                                    + "--b\nContent-Type: text/plain\n\nbody\n");
            for (int i = 0; i <= ZipBombGuard.MAX_ENTRIES; i++) {
                content.append("--b\nContent-Disposition: attachment; filename=f")
                        .append(i)
                        .append(".txt\n\nx\n");
            }
            content.append("--b--\n");
            byte[] message = eml(content.toString());

            assertThatThrownBy(
                            () ->
                                    EmlParser.extractEmailContent(
                                            message, requestWithAttachments(10), null))
                    .isInstanceOf(java.io.IOException.class)
                    .hasMessageContaining("attachments");

            EmlToPdfRequest listingOnly = new EmlToPdfRequest();
            listingOnly.setIncludeAttachments(false);
            EmailContent listed = EmlParser.extractEmailContent(message, listingOnly, null);
            assertThat(listed.getAttachmentCount()).isEqualTo(ZipBombGuard.MAX_ENTRIES + 1);
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
