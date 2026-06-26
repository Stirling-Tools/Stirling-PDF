package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Gap-coverage tests for {@link RegexPatternUtils}. The existing RegexPatternUtilsTest covers
 * caching mechanics; this file exercises the many lazily-built named accessor patterns, the static
 * regex string getters, flag-aware cache operations, and the invalid-regex compile path.
 */
class RegexPatternUtilsMoreTest {

    private final RegexPatternUtils utils = RegexPatternUtils.getInstance();

    @Nested
    @DisplayName("static regex string getters")
    class StaticRegexTests {

        @Test
        @DisplayName("whitespace and extension regex strings are returned")
        void staticStrings() {
            assertEquals("\\s++", RegexPatternUtils.getWhitespaceRegex());
            assertEquals("\\.(?:[^.]*+)?$", RegexPatternUtils.getExtensionRegex());
        }

        @Test
        @DisplayName("supported new field types contains the documented set")
        void supportedFieldTypes() {
            Set<String> types = utils.getSupportedNewFieldTypes();
            assertThat(types)
                    .contains(
                            "text",
                            "checkbox",
                            "combobox",
                            "listbox",
                            "radio",
                            "button",
                            "signature");
        }
    }

    @Nested
    @DisplayName("flag-aware cache operations")
    class FlagCacheTests {

        @Test
        @DisplayName("removeFromCache with flags removes the flagged entry only")
        void removeWithFlags() {
            String regex = "moreflagcache\\d+";
            utils.getPattern(regex, Pattern.CASE_INSENSITIVE);
            assertTrue(utils.isCached(regex, Pattern.CASE_INSENSITIVE));

            assertTrue(utils.removeFromCache(regex, Pattern.CASE_INSENSITIVE));
            assertFalse(utils.isCached(regex, Pattern.CASE_INSENSITIVE));
            // Removing again returns false.
            assertFalse(utils.removeFromCache(regex, Pattern.CASE_INSENSITIVE));
        }

        @Test
        @DisplayName("isCached with flags is false for null regex")
        void isCachedNullWithFlags() {
            assertFalse(utils.isCached(null, Pattern.CASE_INSENSITIVE));
        }

        @Test
        @DisplayName("removeFromCache with flags is false for null regex")
        void removeNullWithFlags() {
            assertFalse(utils.removeFromCache(null, Pattern.CASE_INSENSITIVE));
        }
    }

    @Nested
    @DisplayName("invalid regex compilation")
    class InvalidRegexTests {

        @Test
        @DisplayName("an invalid pattern propagates PatternSyntaxException")
        void invalidPattern() {
            assertThrows(PatternSyntaxException.class, () -> utils.getPattern("[unclosed"));
        }
    }

    @Nested
    @DisplayName("path and filename patterns")
    class PathFilenameTests {

        @Test
        void driveLetterPattern() {
            assertTrue(utils.getDriveLetterPattern().matcher("C:\\Users\\x").find());
        }

        @Test
        void leadingSlashesPattern() {
            assertTrue(utils.getLeadingSlashesPattern().matcher("//leading").find());
        }

        @Test
        void backslashPattern() {
            assertTrue(utils.getBackslashPattern().matcher("a\\b").find());
        }

        @Test
        void filenameSafePattern() {
            assertTrue(utils.getFilenameSafePattern().matcher("a!b").find());
        }

        @Test
        void nonAlnumUnderscorePattern() {
            assertTrue(utils.getNonAlnumUnderscorePattern().matcher("a-b").find());
            assertFalse(utils.getNonAlnumUnderscorePattern().matcher("a_b").find());
        }

        @Test
        void underscoreCollapsePatterns() {
            assertTrue(utils.getMultipleUnderscoresPattern().matcher("a__b").find());
            assertTrue(utils.getLeadingUnderscoresPattern().matcher("__a").find());
            assertTrue(utils.getTrailingUnderscoresPattern().matcher("a__").find());
        }

        @Test
        void uploadDownloadPathPattern() {
            assertTrue(utils.getUploadDownloadPathPattern().matcher("/api/UPLOAD/file").matches());
        }
    }

    @Nested
    @DisplayName("whitespace, newline and word patterns")
    class WhitespaceNewlineTests {

        @Test
        void whitespaceAndWordSplit() {
            assertEquals(2, utils.getWordSplitPattern().split("a b").length);
            assertTrue(utils.getWhitespacePattern().matcher("a b").find());
        }

        @Test
        void punctuationPattern() {
            assertTrue(utils.getPunctuationPattern().matcher("a!b").find());
        }

        @Test
        void newlineVariants() {
            assertTrue(utils.getNewlinesPattern().matcher("a\r\nb").find());
            assertTrue(utils.getNewlineSplitPattern().matcher("a\nb").find());
            assertTrue(utils.getCarriageReturnPattern().matcher("a\rb").find());
            assertTrue(utils.getNewlineCharsPattern().matcher("a\nb").find());
            assertTrue(utils.getMultiFormatNewlinePattern().matcher("a\r\nb").find());
            assertTrue(utils.getEncodedPayloadNewlinePattern().matcher("a\nb").find());
            assertTrue(utils.getLineSeparatorPattern().matcher("a\nb").find());
        }

        @Test
        void escapedNewlinePattern() {
            assertTrue(utils.getEscapedNewlinePattern().matcher("line\\nbreak").find());
        }
    }

    @Nested
    @DisplayName("sanitization and field-name patterns")
    class SanitizationTests {

        @Test
        void inputSanitizePattern() {
            assertTrue(utils.getInputSanitizePattern().matcher("a@b").find());
        }

        @Test
        void formFieldBracketPattern() {
            assertEquals(
                    "field", utils.getFormFieldBracketPattern().matcher("field[0]").replaceAll(""));
        }

        @Test
        void underscoreHyphenPattern() {
            assertTrue(utils.getUnderscoreHyphenPattern().matcher("a-_b").find());
        }

        @Test
        void camelCaseBoundaryPattern() {
            assertEquals(
                    "first Name",
                    utils.getCamelCaseBoundaryPattern().matcher("firstName").replaceAll(" "));
        }

        @Test
        void angleBracketsAndQuotes() {
            assertTrue(utils.getAngleBracketsPattern().matcher("a<b>c").find());
            assertTrue(utils.getQuotesRemovalPattern().matcher("\"q\"").find());
        }

        @Test
        void plusAndPipe() {
            assertTrue(utils.getPlusSignPattern().matcher("a+b").find());
            assertEquals(2, utils.getPipeDelimiterPattern().split("a|b").length);
        }

        @Test
        void usernameValidationPattern() {
            assertTrue(utils.getUsernameValidationPattern().matcher("john_doe1").matches());
            assertFalse(utils.getUsernameValidationPattern().matcher("a--b").matches());
        }

        @Test
        void genericAndSimpleFieldPatterns() {
            assertTrue(utils.getGenericFieldNamePattern().matcher("Field 1").matches());
            assertTrue(utils.getSimpleFormFieldPattern().matcher("t1").matches());
            assertTrue(utils.getOptionalTNumericPattern().matcher("t 12").matches());
        }
    }

    @Nested
    @DisplayName("number and math patterns")
    class NumberMathTests {

        @Test
        void numericExtractionAndDigitPatterns() {
            assertTrue(utils.getNumericExtractionPattern().matcher("a1").find());
            assertTrue(utils.getNonDigitDotPattern().matcher("1a").find());
            assertTrue(utils.getDigitDotPattern().matcher("1.0").find());
            assertTrue(utils.getContainsDigitsPattern().matcher("ab12cd").matches());
            assertTrue(utils.getNumberRangePattern().matcher("250").matches());
        }

        @Test
        void mathExpressionPatterns() {
            assertTrue(utils.getMathExpressionPattern().matcher("2n+1").matches());
            assertTrue(utils.getNumberBeforeNPattern().matcher("4n").find());
            assertTrue(utils.getConsecutiveNPattern().matcher("annb").matches());
            assertTrue(utils.getConsecutiveNReplacementPattern().matcher("nn").find());
        }
    }

    @Nested
    @DisplayName("url, email and html patterns")
    class UrlEmailHtmlTests {

        @Test
        void httpAndLinkPatterns() {
            assertTrue(utils.getHttpUrlPattern().matcher("https://x.com").matches());
            assertTrue(utils.getUrlLinkPattern().matcher("see http://x.com/a").find());
            assertTrue(utils.getEmailLinkPattern().matcher("a@b.com").find());
        }

        @Test
        void emailValidationPattern() {
            assertTrue(utils.getEmailValidationPattern().matcher("user@example.com").matches());
            assertFalse(utils.getEmailValidationPattern().matcher("not-an-email").matches());
        }

        @Test
        void scriptStyleAndCssPatterns() {
            assertTrue(utils.getScriptTagPattern().matcher("<script>x()</script>").find());
            assertTrue(utils.getStyleTagPattern().matcher("<style>a{}</style>").find());
            assertTrue(utils.getFixedPositionCssPattern().matcher("position: fixed;").find());
            assertTrue(utils.getAbsolutePositionCssPattern().matcher("position: absolute;").find());
        }

        @Test
        void inlineCidAndImagePatterns() {
            assertTrue(utils.getInlineCidImagePattern().matcher("<img src=\"cid:abc\">").find());
            assertTrue(utils.getImageFilePattern().matcher("photo.JPG").matches());
        }
    }

    @Nested
    @DisplayName("size, temp-file and mime patterns")
    class SizeTempMimeTests {

        @Test
        void sizeUnitPattern() {
            assertTrue(utils.getSizeUnitPattern().matcher("MB").find());
        }

        @Test
        void systemTempFilePatterns() {
            assertTrue(utils.getSystemTempFile1Pattern().matcher("lu123abc.tmp").find());
            assertTrue(utils.getSystemTempFile2Pattern().matcher("ocr_process42").find());
        }

        @Test
        void whitespaceParensSplit() {
            assertTrue(utils.getWhitespaceParenthesesSplitPattern().matcher("a (b)").find());
        }

        @Test
        void mimeHeaderAndEncodedWord() {
            assertTrue(utils.getMimeHeaderWhitespacePattern().matcher("a =?utf-8").find());
            assertTrue(utils.getMimeEncodedWordPattern().matcher("=?utf-8?B?abc?=").find());
        }

        @Test
        void fontNamePattern() {
            assertTrue(utils.getFontNamePattern().matcher("ABCDEF+Arial").matches());
        }
    }

    @Nested
    @DisplayName("xml, attachment and api-doc patterns")
    class XmlAttachmentApiTests {

        @Test
        void accessReadOnlyAndXmpPatterns() {
            assertTrue(utils.getAccessReadOnlyPattern().matcher("access=\"readOnly\"").find());
            assertTrue(utils.getPdfAidPartPattern().matcher("pdfaid:part=\"2\"").find());
            assertTrue(
                    utils.getPdfAidConformancePattern().matcher("pdfaid:conformance=\"B\"").find());
        }

        @Test
        void attachmentPatterns() {
            assertTrue(utils.getAttachmentSectionPattern().matcher("Attachments (3)").find());
            assertTrue(utils.getAttachmentFilenamePattern().matcher("@ file.txt").find());
        }

        @Test
        void pageModeAndApiDocPatterns() {
            assertTrue(utils.getPageModePattern().matcher("a/b").find());
            assertTrue(utils.getApiDocOutputTypePattern().matcher("Output: PDF").find());
            assertTrue(utils.getApiDocInputTypePattern().matcher("Input: PDF").find());
            assertTrue(utils.getApiDocTypePattern().matcher("Type: WEB").find());
        }

        @Test
        void fileExtensionValidationAndLeadingAsterisks() {
            assertTrue(utils.getFileExtensionValidationPattern().matcher("pdf").matches());
            assertFalse(utils.getFileExtensionValidationPattern().matcher("a").matches());
            assertEquals(
                    "text",
                    utils.getLeadingAsterisksWhitespacePattern()
                            .matcher("** text")
                            .replaceFirst(""));
        }
    }

    @Test
    @DisplayName("every cached accessor returns a non-null pattern")
    void accessorsNeverNull() {
        assertNotNull(utils.getTrailingSlashesPattern());
        assertNotNull(utils.getSafeFilenamePattern());
        assertNotNull(utils.getWordSplitPattern());
    }
}
