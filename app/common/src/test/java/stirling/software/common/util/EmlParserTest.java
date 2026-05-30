package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class EmlParserTest {

    @Nested
    @DisplayName("safeMimeDecode")
    class SafeMimeDecodeTests {

        @Test
        @DisplayName("should return empty string for null input")
        void nullInput() {
            assertEquals("", EmlParser.safeMimeDecode(null));
        }

        @Test
        @DisplayName("should return empty string for empty input")
        void emptyInput() {
            assertEquals("", EmlParser.safeMimeDecode(""));
        }

        @Test
        @DisplayName("should return empty string for blank input")
        void blankInput() {
            assertEquals("", EmlParser.safeMimeDecode("   "));
        }

        @Test
        @DisplayName("should return plain text as-is")
        void plainText() {
            assertEquals("Hello World", EmlParser.safeMimeDecode("Hello World"));
        }

        @Test
        @DisplayName("should trim surrounding whitespace")
        void trimWhitespace() {
            assertEquals("Hello", EmlParser.safeMimeDecode("  Hello  "));
        }

        @Test
        @DisplayName("should decode base64 MIME encoded word")
        void decodeBase64MimeWord() {
            // =?UTF-8?B?SGVsbG8=?= is Base64 for "Hello"
            assertEquals("Hello", EmlParser.safeMimeDecode("=?UTF-8?B?SGVsbG8=?="));
        }

        @Test
        @DisplayName("should decode quoted-printable MIME encoded word")
        void decodeQpMimeWord() {
            // =?UTF-8?Q?Hello_World?= where _ means space in Q encoding
            assertEquals("Hello World", EmlParser.safeMimeDecode("=?UTF-8?Q?Hello_World?="));
        }

        @Test
        @DisplayName("should handle mixed text and encoded words")
        void mixedTextAndEncoded() {
            String input = "Re: =?UTF-8?B?SGVsbG8=?= test";
            String result = EmlParser.safeMimeDecode(input);
            assertEquals("Re: Hello test", result);
        }
    }

    @Nested
    @DisplayName("extractEmailContent")
    class ExtractEmailContentTests {

        @Test
        @DisplayName("should throw on null input")
        void nullInput() {
            assertThrows(Exception.class, () -> EmlParser.extractEmailContent(null, null, null));
        }

        @Test
        @DisplayName("should throw on empty input")
        void emptyInput() {
            assertThrows(
                    Exception.class, () -> EmlParser.extractEmailContent(new byte[0], null, null));
        }

        @Test
        @DisplayName("should throw on invalid content that is not EML or MSG")
        void invalidContent() {
            byte[] randomBytes = "This is not an email file at all.".getBytes();
            assertThrows(
                    Exception.class, () -> EmlParser.extractEmailContent(randomBytes, null, null));
        }
    }
}
