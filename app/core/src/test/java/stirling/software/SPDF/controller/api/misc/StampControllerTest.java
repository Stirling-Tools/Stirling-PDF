package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class StampControllerTest {

    private static final Pattern UUID_HEX_PATTERN = Pattern.compile("[0-9a-f]{8}");
    private static final Pattern DATE_LITERAL_REGEX =
            Pattern.compile("@date is \\d{4}-\\d{2}-\\d{2}");
    private static final Pattern DATE_TIME_MIN_PATTERN =
            Pattern.compile("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}");
    private static final Pattern DATE_SLASH_PATTERN = Pattern.compile("\\d{2}/\\d{2}/\\d{4}");
    private static final Pattern DAY_LABEL_PATTERN = Pattern.compile("Day: \\d{2}");
    private static final Pattern MONTH_LABEL_PATTERN = Pattern.compile("Month: \\d{2}");
    private static final Pattern DATE_TIME_FULL_PATTERN =
            Pattern.compile("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}");
    private static final Pattern TIME_LABEL_PATTERN = Pattern.compile("Time: \\d{2}:\\d{2}:\\d{2}");
    private static final Pattern DATE_LABEL_PATTERN = Pattern.compile("Date: \\d{4}-\\d{2}-\\d{2}");
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private StampController stampController;

    private Method processStampTextMethod;
    private Method processCustomDateFormatMethod;

    @BeforeEach
    void setUp() throws NoSuchMethodException {
        processStampTextMethod =
                StampController.class.getDeclaredMethod(
                        "processStampText",
                        String.class,
                        int.class,
                        int.class,
                        String.class,
                        PDDocument.class);
        processStampTextMethod.setAccessible(true);

        processCustomDateFormatMethod =
                StampController.class.getDeclaredMethod(
                        "processCustomDateFormat", String.class, LocalDateTime.class);
        processCustomDateFormatMethod.setAccessible(true);
    }

    private String invokeProcessStampText(
            String stampText, int pageNumber, int totalPages, String filename, PDDocument document)
            throws Exception {
        try {
            return (String)
                    processStampTextMethod.invoke(
                            stampController, stampText, pageNumber, totalPages, filename, document);
        } catch (InvocationTargetException e) {
            throw (Exception) e.getCause();
        }
    }

    private String invokeProcessCustomDateFormat(String format, LocalDateTime now)
            throws Exception {
        try {
            return (String) processCustomDateFormatMethod.invoke(stampController, format, now);
        } catch (InvocationTargetException e) {
            throw (Exception) e.getCause();
        }
    }

    @Nested
    @DisplayName("Basic Variable Substitution Tests")
    class BasicVariableTests {

        @Test
        @DisplayName("Should replace @page_number with current page")
        void testPageNumberReplacement() throws Exception {
            String result = invokeProcessStampText("Page @page_number", 5, 20, "test.pdf", null);
            assertEquals("Page 5", result);
        }

        @Test
        @DisplayName("Should replace @total_pages with total page count")
        void testTotalPagesReplacement() throws Exception {
            String result =
                    invokeProcessStampText("of @total_pages pages", 1, 100, "test.pdf", null);
            assertEquals("of 100 pages", result);
        }

        @Test
        @DisplayName("Should replace combined page variables")
        void testCombinedPageVariables() throws Exception {
            String result =
                    invokeProcessStampText(
                            "Page @page_number of @total_pages", 5, 20, "test.pdf", null);
            assertEquals("Page 5 of 20", result);
        }

        @Test
        @DisplayName("Should replace @page alias")
        void testPageAlias() throws Exception {
            String result = invokeProcessStampText("Page @page", 7, 10, "test.pdf", null);
            assertEquals("Page 7", result);
        }

        @Test
        @DisplayName("Should replace @page_count alias for total pages")
        void testPageCountAlias() throws Exception {
            String result = invokeProcessStampText("Total: @page_count", 1, 50, "test.pdf", null);
            assertEquals("Total: 50", result);
        }
    }

    @Nested
    @DisplayName("Filename Variable Tests")
    class FilenameTests {

        @Test
        @DisplayName("Should replace @filename with filename without extension")
        void testFilenameWithoutExtension() throws Exception {
            String result = invokeProcessStampText("File: @filename", 1, 1, "document.pdf", null);
            assertEquals("File: document", result);
        }

        @Test
        @DisplayName("Should replace @filename_full with full filename")
        void testFilenameWithExtension() throws Exception {
            String result =
                    invokeProcessStampText("File: @filename_full", 1, 1, "document.pdf", null);
            assertEquals("File: document.pdf", result);
        }

        @Test
        @DisplayName("Should handle filename without extension")
        void testFilenameWithoutDot() throws Exception {
            String result = invokeProcessStampText("@filename", 1, 1, "document", null);
            assertEquals("document", result);
        }

        @Test
        @DisplayName("Should handle null filename")
        void testNullFilename() throws Exception {
            String result = invokeProcessStampText("File: @filename", 1, 1, null, null);
            assertEquals("File: ", result);
        }

        @Test
        @DisplayName("Should handle filename with multiple dots")
        void testFilenameMultipleDots() throws Exception {
            String result = invokeProcessStampText("@filename", 1, 1, "my.document.v2.pdf", null);
            assertEquals("my.document.v2", result);
        }

        @Test
        @DisplayName("Should handle hidden file (starts with dot)")
        void testHiddenFile() throws Exception {
            String result = invokeProcessStampText("@filename", 1, 1, ".hidden.pdf", null);
            assertEquals(".hidden", result);
        }
    }

    @Nested
    @DisplayName("Date/Time Variable Tests")
    class DateTimeTests {

        @Test
        @DisplayName("Should replace @date with current date")
        void testDateReplacement() throws Exception {
            String result = invokeProcessStampText("Date: @date", 1, 1, "test.pdf", null);
            assertTrue(
                    DATE_LABEL_PATTERN.matcher(result).matches(),
                    "Date should match YYYY-MM-DD format");
        }

        @Test
        @DisplayName("Should replace @time with current time")
        void testTimeReplacement() throws Exception {
            String result = invokeProcessStampText("Time: @time", 1, 1, "test.pdf", null);
            assertTrue(
                    TIME_LABEL_PATTERN.matcher(result).matches(),
                    "Time should match HH:mm:ss format");
        }

        @Test
        @DisplayName("Should replace @datetime with combined date and time")
        void testDateTimeReplacement() throws Exception {
            String result = invokeProcessStampText("@datetime", 1, 1, "test.pdf", null);
            // DateTime format: YYYY-MM-DD HH:mm:ss
            assertTrue(
                    DATE_TIME_FULL_PATTERN.matcher(result).matches(),
                    "DateTime should match YYYY-MM-DD HH:mm:ss format");
        }

        @Test
        @DisplayName("Should replace @year with current year")
        void testYearReplacement() throws Exception {
            String result = invokeProcessStampText("© @year", 1, 1, "test.pdf", null);
            int currentYear = LocalDateTime.now().getYear();
            assertEquals("© " + currentYear, result);
        }

        @Test
        @DisplayName("Should replace @month with zero-padded month")
        void testMonthReplacement() throws Exception {
            String result = invokeProcessStampText("Month: @month", 1, 1, "test.pdf", null);
            assertTrue(
                    MONTH_LABEL_PATTERN.matcher(result).matches(), "Month should be zero-padded");
        }

        @Test
        @DisplayName("Should replace @day with zero-padded day")
        void testDayReplacement() throws Exception {
            String result = invokeProcessStampText("Day: @day", 1, 1, "test.pdf", null);
            assertTrue(DAY_LABEL_PATTERN.matcher(result).matches(), "Day should be zero-padded");
        }
    }

    @Nested
    @DisplayName("Custom Date Format Tests")
    class CustomDateFormatTests {

        @Test
        @DisplayName("Should handle custom date format dd/MM/yyyy")
        void testCustomDateFormatSlash() throws Exception {
            String result = invokeProcessStampText("@date{dd/MM/yyyy}", 1, 1, "test.pdf", null);
            assertTrue(
                    DATE_SLASH_PATTERN.matcher(result).matches(),
                    "Should match dd/MM/yyyy format: " + result);
        }

        @Test
        @DisplayName("Should handle custom date format with time")
        void testCustomDateFormatWithTime() throws Exception {
            String result =
                    invokeProcessStampText("@date{yyyy-MM-dd HH:mm}", 1, 1, "test.pdf", null);
            assertTrue(
                    DATE_TIME_MIN_PATTERN.matcher(result).matches(),
                    "Should match yyyy-MM-dd HH:mm format: " + result);
        }

        @Test
        @DisplayName("Should handle multiple custom date formats in same text")
        void testMultipleCustomDateFormats() throws Exception {
            String result =
                    invokeProcessStampText(
                            "Start: @date{dd/MM/yyyy} End: @date{yyyy}", 1, 1, "test.pdf", null);
            assertTrue(result.contains("/"), "Should contain slash from first format");
            // Should have year twice (once with slashes, once alone)
        }
    }

    @Nested
    @DisplayName("Custom Date Format Security Tests")
    class CustomDateFormatSecurityTests {

        @Test
        @DisplayName("Should not match format that is too long - regex won't capture it")
        void testFormatTooLong() throws Exception {
            String longFormat = "y".repeat(51); // 51 chars, over the 50 char regex limit
            String result =
                    invokeProcessStampText("@date{" + longFormat + "}", 1, 1, "test.pdf", null);
            // The CUSTOM_DATE_PATTERN only captures up to 50 chars, so this won't match
            // The @date part will be replaced by simple replacement, leaving {yyy...}
            assertTrue(
                    result.contains("{"), "Should contain { because regex didn't match: " + result);
        }

        @Test
        @DisplayName("Should reject format with unsafe characters - shell injection attempt")
        void testShellInjectionAttempt() throws Exception {
            String result =
                    invokeProcessStampText("@date{yyyy-MM-dd$(rm -rf /)}", 1, 1, "test.pdf", null);
            assertEquals("[invalid format]", result);
        }

        @Test
        @DisplayName("Should reject format with unsafe characters - semicolon")
        void testSemicolonInjection() throws Exception {
            String result = invokeProcessStampText("@date{yyyy;rm}", 1, 1, "test.pdf", null);
            assertEquals("[invalid format]", result);
        }

        @Test
        @DisplayName("Should reject format with unsafe characters - backticks")
        void testBacktickInjection() throws Exception {
            String result = invokeProcessStampText("@date{`whoami`}", 1, 1, "test.pdf", null);
            assertEquals("[invalid format]", result);
        }

        @ParameterizedTest
        @ValueSource(strings = {"$(cmd)", "`cmd`", ";cmd", "|cmd", "&cmd", "<cmd", ">cmd"})
        @DisplayName("Should reject various injection attempts")
        void testVariousInjectionAttempts(String injection) throws Exception {
            String result =
                    invokeProcessStampText("@date{yyyy" + injection + "}", 1, 1, "test.pdf", null);
            assertEquals("[invalid format]", result);
        }

        @Test
        @DisplayName("Should accept valid format characters")
        void testValidFormatCharacters() throws Exception {
            // All these should be valid based on SAFE_DATE_FORMAT_PATTERN: yMdHhmsS/-:.,
            // '+EGuwWDFzZXa and space
            String result =
                    invokeProcessStampText("@date{yyyy-MM-dd HH:mm:ss}", 1, 1, "test.pdf", null);
            assertFalse(
                    result.startsWith("[invalid"), "Valid format should be accepted: " + result);
        }

        @Test
        @DisplayName("Should handle invalid DateTimeFormatter pattern gracefully")
        void testInvalidFormatterPattern() throws Exception {
            LocalDateTime now = LocalDateTime.now();
            // Use 'sssss' - too many seconds digits will throw IllegalArgumentException from
            // DateTimeFormatter
            // Note: The pattern 'sssss' passes the SAFE_DATE_FORMAT_PATTERN but fails
            // DateTimeFormatter.ofPattern()
            String result = invokeProcessCustomDateFormat("sssss", now);
            assertTrue(
                    result.startsWith("[invalid format:"),
                    "Invalid pattern should return error message: " + result);
        }
    }

    @Nested
    @DisplayName("Escape Sequence Tests")
    class EscapeSequenceTests {

        @Test
        @DisplayName("Should convert @@ to literal @")
        void testDoubleAtEscape() throws Exception {
            String result =
                    invokeProcessStampText("Email: test@@example.com", 1, 1, "test.pdf", null);
            assertEquals("Email: test@example.com", result);
        }

        @Test
        @DisplayName("Should preserve @@ before variable")
        void testEscapeBeforeVariable() throws Exception {
            String result = invokeProcessStampText("@@date is @date", 1, 1, "test.pdf", null);
            // @@date should become @date, and @date should be replaced with actual date
            assertTrue(result.startsWith("@date is "), "Should start with literal @date");
            assertTrue(
                    DATE_LITERAL_REGEX.matcher(result).matches(),
                    "Should have date after: " + result);
        }

        @Test
        @DisplayName("Should handle multiple escape sequences")
        void testMultipleEscapes() throws Exception {
            String result = invokeProcessStampText("@@one @@two @@three", 1, 1, "test.pdf", null);
            assertEquals("@one @two @three", result);
        }

        @Test
        @DisplayName("Should handle escape at end of string")
        void testEscapeAtEnd() throws Exception {
            String result = invokeProcessStampText("Contact: user@@", 1, 1, "test.pdf", null);
            assertEquals("Contact: user@", result);
        }
    }

    @Nested
    @DisplayName("Document Metadata Tests")
    class DocumentMetadataTests {

        @Test
        @DisplayName("Should replace @author with document author")
        void testAuthorReplacement() throws Exception {
            PDDocument doc = new PDDocument();
            PDDocumentInformation info = new PDDocumentInformation();
            info.setAuthor("John Doe");
            doc.setDocumentInformation(info);

            try {
                String result = invokeProcessStampText("Author: @author", 1, 1, "test.pdf", doc);
                assertEquals("Author: John Doe", result);
            } finally {
                doc.close();
            }
        }

        @Test
        @DisplayName("Should replace @title with document title")
        void testTitleReplacement() throws Exception {
            PDDocument doc = new PDDocument();
            PDDocumentInformation info = new PDDocumentInformation();
            info.setTitle("My Document Title");
            doc.setDocumentInformation(info);

            try {
                String result = invokeProcessStampText("Title: @title", 1, 1, "test.pdf", doc);
                assertEquals("Title: My Document Title", result);
            } finally {
                doc.close();
            }
        }

        @Test
        @DisplayName("Should replace @subject with document subject")
        void testSubjectReplacement() throws Exception {
            PDDocument doc = new PDDocument();
            PDDocumentInformation info = new PDDocumentInformation();
            info.setSubject("Important Subject");
            doc.setDocumentInformation(info);

            try {
                String result = invokeProcessStampText("Subject: @subject", 1, 1, "test.pdf", doc);
                assertEquals("Subject: Important Subject", result);
            } finally {
                doc.close();
            }
        }

        @Test
        @DisplayName("Should handle null metadata gracefully")
        void testNullMetadata() throws Exception {
            PDDocument doc = new PDDocument();
            // Don't set any document information

            try {
                String result =
                        invokeProcessStampText("@author @title @subject", 1, 1, "test.pdf", doc);
                assertEquals("  ", result); // All should be empty strings
            } finally {
                doc.close();
            }
        }

        @Test
        @DisplayName("Should handle null document gracefully")
        void testNullDocument() throws Exception {
            String result = invokeProcessStampText("Author: @author", 1, 1, "test.pdf", null);
            assertEquals("Author: ", result);
        }
    }

    @Nested
    @DisplayName("UUID Variable Tests")
    class UuidTests {

        @Test
        @DisplayName("Should generate 8-character UUID")
        void testUuidLength() throws Exception {
            String result = invokeProcessStampText("ID: @uuid", 1, 1, "test.pdf", null);
            // UUID format: "ID: " + 8 chars
            assertEquals(12, result.length(), "Should be 'ID: ' + 8 char UUID");
        }

        @Test
        @DisplayName("Should generate different UUIDs for each call")
        void testUuidUniqueness() throws Exception {
            String result1 = invokeProcessStampText("@uuid", 1, 1, "test.pdf", null);
            String result2 = invokeProcessStampText("@uuid", 1, 1, "test.pdf", null);
            assertNotEquals(result1, result2, "UUIDs should be unique");
        }

        @Test
        @DisplayName("UUID should contain only hex characters")
        void testUuidFormat() throws Exception {
            String result = invokeProcessStampText("@uuid", 1, 1, "test.pdf", null);
            assertTrue(
                    UUID_HEX_PATTERN.matcher(result).matches(),
                    "UUID should be 8 hex characters: " + result);
        }
    }

    @Nested
    @DisplayName("Edge Cases and Error Handling")
    class EdgeCaseTests {

        @Test
        @DisplayName("Should handle null stamp text")
        void testNullStampText() throws Exception {
            String result = invokeProcessStampText(null, 1, 1, "test.pdf", null);
            assertEquals("", result);
        }

        @Test
        @DisplayName("Should handle empty stamp text")
        void testEmptyStampText() throws Exception {
            String result = invokeProcessStampText("", 1, 1, "test.pdf", null);
            assertEquals("", result);
        }

        @Test
        @DisplayName("Should handle text with no variables")
        void testNoVariables() throws Exception {
            String result = invokeProcessStampText("Just plain text", 1, 1, "test.pdf", null);
            assertEquals("Just plain text", result);
        }

        @Test
        @DisplayName("Should handle unknown variables")
        void testUnknownVariable() throws Exception {
            String result = invokeProcessStampText("@unknown_var", 1, 1, "test.pdf", null);
            assertEquals("@unknown_var", result);
        }

        @Test
        @DisplayName("Should preserve text around variables")
        void testPreservesSurroundingText() throws Exception {
            String result =
                    invokeProcessStampText("Before @page_number After", 5, 10, "test.pdf", null);
            assertEquals("Before 5 After", result);
        }

        @Test
        @DisplayName("Should handle multiple same variables")
        void testMultipleSameVariables() throws Exception {
            String result =
                    invokeProcessStampText("@page_number / @page_number", 3, 10, "test.pdf", null);
            assertEquals("3 / 3", result);
        }

        @Test
        @DisplayName("Should handle variables adjacent to each other")
        void testAdjacentVariables() throws Exception {
            String result = invokeProcessStampText("@page@page_number", 5, 10, "test.pdf", null);
            // @page should be replaced first (it's in the order), then @page_number
            // Since @page_number is longer and comes first in replace chain, should work
            assertEquals("55", result);
        }
    }

    @Nested
    @DisplayName("Complex Scenario Tests")
    class ComplexScenarioTests {

        @Test
        @DisplayName("Should handle legal footer template")
        void testLegalFooterTemplate() throws Exception {
            String template = "© @year - All Rights Reserved\\n@filename - Page @page_number";
            String result = invokeProcessStampText(template, 3, 15, "contract.pdf", null);

            int year = LocalDateTime.now().getYear();
            String expected = "© " + year + " - All Rights Reserved\\ncontract - Page 3";
            assertEquals(expected, result);
        }

        @Test
        @DisplayName("Should handle Brazilian date format template")
        void testBrazilianDateFormat() throws Exception {
            String template = "Documento criado em @date{dd/MM/yyyy} às @time";
            String result = invokeProcessStampText(template, 1, 1, "doc.pdf", null);

            assertTrue(result.startsWith("Documento criado em "));
            assertTrue(result.contains("/"));
            assertTrue(result.contains(":"));
        }

        @ParameterizedTest
        @CsvSource({
            "'Page @page_number of @total_pages', 1, 10, 'Page 1 of 10'",
            "'Page @page_number of @total_pages', 5, 20, 'Page 5 of 20'",
            "'Page @page_number of @total_pages', 100, 1000, 'Page 100 of 1000'"
        })
        @DisplayName("Should handle page number template with various values")
        void testPageNumberTemplates(String template, int page, int total, String expected)
                throws Exception {
            String result = invokeProcessStampText(template, page, total, "test.pdf", null);
            assertEquals(expected, result);
        }
    }
}
