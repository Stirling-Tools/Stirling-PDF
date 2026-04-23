package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class EmlProcessingUtilsTest {

    @Nested
    @DisplayName("validateEmlInput")
    class ValidateEmlInputTests {

        @Test
        @DisplayName("should throw on null input")
        void nullInput() {
            assertThrows(Exception.class, () -> EmlProcessingUtils.validateEmlInput(null));
        }

        @Test
        @DisplayName("should throw on empty input")
        void emptyInput() {
            assertThrows(Exception.class, () -> EmlProcessingUtils.validateEmlInput(new byte[0]));
        }

        @Test
        @DisplayName("should throw on invalid format with insufficient headers")
        void invalidFormat() {
            byte[] data = "Hello, this is just random text without email headers.".getBytes();
            assertThrows(Exception.class, () -> EmlProcessingUtils.validateEmlInput(data));
        }

        @Test
        @DisplayName("should accept valid EML with multiple headers")
        void validEml() {
            String emlContent =
                    "From: sender@example.com\r\n"
                            + "To: recipient@example.com\r\n"
                            + "Subject: Test\r\n"
                            + "Date: Mon, 1 Jan 2024 00:00:00 +0000\r\n"
                            + "\r\n"
                            + "Body text";
            assertDoesNotThrow(() -> EmlProcessingUtils.validateEmlInput(emlContent.getBytes()));
        }
    }

    @Nested
    @DisplayName("isMsgFile")
    class IsMsgFileTests {

        @Test
        @DisplayName("should return false for null")
        void nullInput() {
            assertFalse(EmlProcessingUtils.isMsgFile(null));
        }

        @Test
        @DisplayName("should return false for short bytes")
        void shortBytes() {
            assertFalse(EmlProcessingUtils.isMsgFile(new byte[] {0x01, 0x02}));
        }

        @Test
        @DisplayName("should return true for MSG magic bytes")
        void msgMagicBytes() {
            byte[] magic = {
                (byte) 0xD0,
                (byte) 0xCF,
                (byte) 0x11,
                (byte) 0xE0,
                (byte) 0xA1,
                (byte) 0xB1,
                (byte) 0x1A,
                (byte) 0xE1,
                0x00,
                0x00
            };
            assertTrue(EmlProcessingUtils.isMsgFile(magic));
        }

        @Test
        @DisplayName("should return false for non-MSG bytes")
        void nonMsgBytes() {
            byte[] data = new byte[] {0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00};
            assertFalse(EmlProcessingUtils.isMsgFile(data));
        }
    }

    @Nested
    @DisplayName("escapeHtml")
    class EscapeHtmlTests {

        @Test
        @DisplayName("should return empty string for null")
        void nullInput() {
            assertEquals("", EmlProcessingUtils.escapeHtml(null));
        }

        @Test
        @DisplayName("should escape all HTML special characters")
        void escapeSpecialChars() {
            String result = EmlProcessingUtils.escapeHtml("<div class=\"test\">'&'</div>");
            assertEquals("&lt;div class=&quot;test&quot;&gt;&#39;&amp;&#39;&lt;/div&gt;", result);
        }

        @Test
        @DisplayName("should not modify plain text")
        void plainText() {
            assertEquals("Hello World", EmlProcessingUtils.escapeHtml("Hello World"));
        }
    }

    @Nested
    @DisplayName("convertTextToHtml")
    class ConvertTextToHtmlTests {

        @Test
        @DisplayName("should return empty string for null")
        void nullInput() {
            assertEquals("", EmlProcessingUtils.convertTextToHtml(null, null));
        }

        @Test
        @DisplayName("should convert newlines to br tags")
        void newlinesToBr() {
            String result = EmlProcessingUtils.convertTextToHtml("Line1\nLine2", null);
            assertTrue(result.contains("<br>"));
        }

        @Test
        @DisplayName("should convert CRLF to br tags")
        void crlfToBr() {
            String result = EmlProcessingUtils.convertTextToHtml("Line1\r\nLine2", null);
            assertTrue(result.contains("<br>"));
            assertFalse(result.contains("\r"));
        }

        @Test
        @DisplayName("should linkify URLs")
        void linkifyUrls() {
            String result =
                    EmlProcessingUtils.convertTextToHtml("Visit https://example.com today", null);
            assertTrue(result.contains("<a href=\"https://example.com\""));
        }

        @Test
        @DisplayName("should linkify email addresses")
        void linkifyEmails() {
            String result = EmlProcessingUtils.convertTextToHtml("Contact test@example.com", null);
            assertTrue(result.contains("mailto:test@example.com"));
        }
    }

    @Nested
    @DisplayName("decodeMimeHeader")
    class DecodeMimeHeaderTests {

        @Test
        @DisplayName("should return null for null input")
        void nullInput() {
            assertNull(EmlProcessingUtils.decodeMimeHeader(null));
        }

        @Test
        @DisplayName("should return empty string for empty input")
        void emptyInput() {
            assertEquals("", EmlProcessingUtils.decodeMimeHeader(""));
        }

        @Test
        @DisplayName("should return plain text unchanged")
        void plainText() {
            assertEquals("Hello World", EmlProcessingUtils.decodeMimeHeader("Hello World"));
        }

        @Test
        @DisplayName("should decode Base64 encoded header")
        void decodeBase64() {
            // "Hello" in Base64
            String result = EmlProcessingUtils.decodeMimeHeader("=?UTF-8?B?SGVsbG8=?=");
            assertEquals("Hello", result);
        }

        @Test
        @DisplayName("should decode quoted-printable encoded header")
        void decodeQuotedPrintable() {
            String result = EmlProcessingUtils.decodeMimeHeader("=?UTF-8?Q?Hello_World?=");
            assertEquals("Hello World", result);
        }

        @Test
        @DisplayName("should decode concatenated encoded words")
        void decodeConcatenated() {
            String input = "=?UTF-8?B?SGVs?= =?UTF-8?B?bG8=?=";
            String result = EmlProcessingUtils.decodeMimeHeader(input);
            assertEquals("Hello", result);
        }

        @Test
        @DisplayName("should handle unknown encoding gracefully")
        void unknownEncoding() {
            String input = "=?UTF-8?X?unknown?=";
            String result = EmlProcessingUtils.decodeMimeHeader(input);
            assertEquals("=?UTF-8?X?unknown?=", result);
        }
    }

    @Nested
    @DisplayName("detectMimeType")
    class DetectMimeTypeTests {

        @Test
        @DisplayName("should return existing MIME type if provided")
        void existingMimeType() {
            assertEquals(
                    "image/jpeg", EmlProcessingUtils.detectMimeType("photo.png", "image/jpeg"));
        }

        @Test
        @DisplayName("should detect PNG from filename")
        void detectPng() {
            assertEquals("image/png", EmlProcessingUtils.detectMimeType("image.png", null));
        }

        @Test
        @DisplayName("should detect JPEG from filename")
        void detectJpeg() {
            assertEquals("image/jpeg", EmlProcessingUtils.detectMimeType("photo.jpg", null));
        }

        @Test
        @DisplayName("should default to image/png for unknown extension")
        void defaultMimeType() {
            assertEquals("image/png", EmlProcessingUtils.detectMimeType("file.xyz", null));
        }

        @Test
        @DisplayName("should default to image/png for null filename and mime")
        void nullFilenameAndMime() {
            assertEquals("image/png", EmlProcessingUtils.detectMimeType(null, null));
        }
    }

    @Nested
    @DisplayName("sanitizeText")
    class SanitizeTextTests {

        @Test
        @DisplayName("should escape HTML when no sanitizer provided")
        void noSanitizer() {
            String result = EmlProcessingUtils.sanitizeText("<script>", null);
            assertEquals("&lt;script&gt;", result);
        }
    }

    @Nested
    @DisplayName("processEmailHtmlBody")
    class ProcessEmailHtmlBodyTests {

        @Test
        @DisplayName("should return empty string for null body")
        void nullBody() {
            assertEquals("", EmlProcessingUtils.processEmailHtmlBody(null, null, null));
        }

        @Test
        @DisplayName("should strip fixed position CSS")
        void stripFixedPosition() {
            String html = "<div style=\"position:fixed; top:0\">content</div>";
            String result = EmlProcessingUtils.processEmailHtmlBody(html, null, null);
            assertFalse(result.contains("position:fixed"));
        }
    }

    @Nested
    @DisplayName("decodeUrlEncoded")
    class DecodeUrlEncodedTests {

        @Test
        @DisplayName("should decode URL-encoded string")
        void decodeEncoded() {
            assertEquals("hello world", EmlProcessingUtils.decodeUrlEncoded("hello%20world"));
        }

        @Test
        @DisplayName("should return original on invalid encoding")
        void invalidEncoding() {
            String result = EmlProcessingUtils.decodeUrlEncoded("%ZZinvalid");
            assertEquals("%ZZinvalid", result);
        }
    }
}
