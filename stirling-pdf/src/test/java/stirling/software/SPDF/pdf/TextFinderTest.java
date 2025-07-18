package stirling.software.SPDF.pdf;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.SPDF.model.PDFText;

@DisplayName("PDF Text Finder tests")
@ExtendWith(MockitoExtension.class)
class TextFinderTest {

    private PDDocument document;
    private PDPage page;

    // Helpers
    private void testTextFinding(String pageContent, String searchTerm, boolean useRegex, boolean wholeWord,
                               String[] expectedTexts, int expectedCount) throws IOException {
        addTextToPage(pageContent);
        TextFinder textFinder = new TextFinder(searchTerm, useRegex, wholeWord);

        textFinder.getText(document);
        List<PDFText> foundTexts = textFinder.getFoundTexts();

        assertEquals(expectedCount, foundTexts.size(),
            String.format("Expected %d matches for search term '%s'", expectedCount, searchTerm));

        if (expectedTexts != null) {
            for (String expectedText : expectedTexts) {
                assertTrue(foundTexts.stream().anyMatch(text -> text.getText().equals(expectedText)),
                    String.format("Expected to find text: '%s'", expectedText));
            }
        }

        // Verify basic properties of found texts
        foundTexts.forEach(text -> {
            assertNotNull(text.getText());
            assertTrue(text.getX1() >= 0);
            assertTrue(text.getY1() >= 0);
            assertTrue(text.getX2() >= text.getX1());
            assertTrue(text.getY2() >= text.getY1());
            assertEquals(0, text.getPageIndex()); // Single page test
        });
    }

    @BeforeEach
    void setUp() {
        document = new PDDocument();
        page = new PDPage(PDRectangle.A4);
        document.addPage(page);
    }

    @AfterEach
    void tearDown() throws IOException {
        if (document != null) {
            document.close();
        }
    }

    @Nested
    @DisplayName("Basic Text Search")
    class BasicSearchTests {

        @Test
        @DisplayName("Should find simple text correctly")
        void findSimpleText() throws IOException {
            testTextFinding("This is a confidential document with secret information.",
                           "confidential", false, false,
                           new String[]{"confidential"}, 1);
        }

        @Test
        @DisplayName("Should perform case-insensitive search")
        void performCaseInsensitiveSearch() throws IOException {
            testTextFinding("This document contains CONFIDENTIAL information.",
                           "confidential", false, false,
                           new String[]{"CONFIDENTIAL"}, 1);
        }

        @Test
        @DisplayName("Should find multiple occurrences of same term")
        void findMultipleOccurrences() throws IOException {
            testTextFinding("The secret code is secret123. Keep this secret safe!",
                           "secret", false, false,
                           new String[]{"secret", "secret", "secret"}, 3);
        }

        @Test
        @DisplayName("Should handle empty search term gracefully")
        void handleEmptySearchTerm() throws IOException {
            testTextFinding("This is a test document.", "", false, false, null, 0);
        }

        @Test
        @DisplayName("Should handle null search term gracefully")
        void handleNullSearchTerm() throws IOException {
            testTextFinding("This is a test document.", null, false, false, null, 0);
        }

        @Test
        @DisplayName("Should return no results when no match found")
        void returnNoResultsWhenNoMatch() throws IOException {
            testTextFinding("This is a test document.", "nonexistent", false, false, null, 0);
        }
    }

    @Nested
    @DisplayName("Whole Word Search")
    class WholeWordSearchTests {

        @Test
        @DisplayName("Should find only whole words when enabled")
        void findOnlyWholeWords() throws IOException {
            testTextFinding("This is a test testing document with tested results.",
                           "test", false, true,
                           new String[]{"test"}, 1);
        }

        @Test
        @DisplayName("Should find partial matches when whole word search disabled")
        void findPartialMatches() throws IOException {
            testTextFinding("This is a test testing document with tested results.",
                           "test", false, false,
                           new String[]{"test", "test", "test"}, 3);
        }

        @Test
        @DisplayName("Should handle punctuation boundaries correctly")
        void handlePunctuationBoundaries() throws IOException {
            testTextFinding("Hello, world! Testing: test-case (test).",
                           "test", false, true,
                           new String[]{"test"}, 2); // Both standalone "test" and "test" in "test-case"
        }

        @Test
        @DisplayName("Should handle word boundaries with special characters")
        void handleSpecialCharacterBoundaries() throws IOException {
            testTextFinding("Email: test@example.com and test.txt file",
                           "test", false, true,
                           new String[]{"test"}, 2); // Both in email and filename should match
        }
    }

    @Nested
    @DisplayName("Regular Expression Search")
    class RegexSearchTests {

        @Test
        @DisplayName("Should find text matching regex pattern")
        void findTextMatchingRegex() throws IOException {
            testTextFinding("Contact John at 123-45-6789 or Jane at 987-65-4321 for details.",
                           "\\d{3}-\\d{2}-\\d{4}", true, false,
                           new String[]{"123-45-6789", "987-65-4321"}, 2);
        }

        @Test
        @DisplayName("Should find email addresses with regex")
        void findEmailAddresses() throws IOException {
            testTextFinding("Email: test@example.com and admin@test.org",
                           "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", true, false,
                           new String[]{"test@example.com", "admin@test.org"}, 2);
        }

        @Test
        @DisplayName("Should combine regex with whole word search")
        void combineRegexWithWholeWord() throws IOException {
            testTextFinding("Email: test@example.com and admin@test.org",
                           "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", true, true,
                           new String[]{"test@example.com", "admin@test.org"}, 2);
        }

        @Test
        @DisplayName("Should find currency patterns")
        void findCurrencyPatterns() throws IOException {
            testTextFinding("Price: $100.50 and €75.25",
                           "\\$\\d+\\.\\d{2}", true, false,
                           new String[]{"$100.50"}, 1);
        }

        @ParameterizedTest
        @ValueSource(strings = {
            "\\d{4}-\\d{2}-\\d{2}", // Date pattern
            "\\b[A-Z]{2,}\\b", // Uppercase words
            "\\w+@\\w+\\.\\w+", // Simple email pattern
            "\\$\\d+", // Simple currency
            "\\b\\d{3,4}\\b" // 3-4 digit numbers
        })
        @DisplayName("Should handle various regex patterns")
        void handleVariousRegexPatterns(String regexPattern) throws IOException {
            String testContent = "Date: 2023-12-25, Email: test@domain.com, Price: $250, Code: ABC123, Number: 1234";
            addTextToPage(testContent);

            TextFinder textFinder = new TextFinder(regexPattern, true, false);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            // Each pattern should find at least one match in our test content
            assertFalse(foundTexts.isEmpty(), String.format("Pattern '%s' should find at least one match", regexPattern));
        }

        @Test
        @DisplayName("Should handle invalid regex gracefully")
        void handleInvalidRegex() throws IOException {
            addTextToPage("This is test content.");

            try {
                TextFinder textFinder = new TextFinder("[invalid regex(", true, false);
                textFinder.getText(document);
                List<PDFText> foundTexts = textFinder.getFoundTexts();
                assertNotNull(foundTexts);
            } catch (java.util.regex.PatternSyntaxException e) {
                assertNotNull(e.getMessage());
                assertTrue(e.getMessage().contains("Unclosed character class") ||
                          e.getMessage().contains("syntax"),
                          "Exception should indicate regex syntax error");
            } catch (RuntimeException | IOException e) {
                assertNotNull(e.getMessage());
            }
        }
    }

    @Nested
    @DisplayName("Special Characters and Encoding")
    class SpecialCharacterTests {

        @Test
        @DisplayName("Should handle international characters")
        void handleInternationalCharacters() throws IOException {
            testTextFinding("Hello café naïve résumé",
                           "café", false, false,
                           new String[]{"café"}, 1);
        }

        @Test
        @DisplayName("Should find text with accented characters")
        void findAccentedCharacters() throws IOException {
            testTextFinding("Café, naïve, résumé, piñata",
                           "café", false, false,
                           new String[]{"Café"}, 1); // Case insensitive
        }

        @Test
        @DisplayName("Should handle special symbols")
        void handleSpecialSymbols() throws IOException {
            testTextFinding("Symbols: © ® ™ ± × ÷ § ¶",
                           "©", false, false,
                           new String[]{"©"}, 1);
        }

        @Test
        @DisplayName("Should find currency symbols")
        void findCurrencySymbols() throws IOException {
            testTextFinding("Prices: $100 €75 £50 ¥1000",
                           "[€£¥]", true, false,
                           new String[]{"€", "£", "¥"}, 3);
        }
    }

    @Nested
    @DisplayName("Multi-page Document Tests")
    class MultiPageTests {

        @Test
        @DisplayName("Should find text across multiple pages")
        void findTextAcrossPages() throws IOException {
            PDPage secondPage = new PDPage(PDRectangle.A4);
            document.addPage(secondPage);

            addTextToPage("First page with confidential data.");

            addTextToPage(secondPage, "Second page with secret information.");

            TextFinder textFinder = new TextFinder("confidential|secret", true, false);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertEquals(2, foundTexts.size());

            long page0Count = foundTexts.stream().filter(text -> text.getPageIndex() == 0).count();
            long page1Count = foundTexts.stream().filter(text -> text.getPageIndex() == 1).count();

            assertEquals(1, page0Count);
            assertEquals(1, page1Count);
        }

        @Test
        @DisplayName("Should handle empty pages gracefully")
        void handleEmptyPages() throws IOException {
            PDPage emptyPage = new PDPage(PDRectangle.A4);
            document.addPage(emptyPage);

            addTextToPage("Content on first page only.");

            TextFinder textFinder = new TextFinder("content", false, false);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertEquals(1, foundTexts.size());
            assertEquals(0, foundTexts.get(0).getPageIndex());
        }
    }

    @Nested
    @DisplayName("Performance and Boundary Tests")
    class PerformanceTests {

        @Test
        @DisplayName("Should handle very long search terms")
        void handleLongSearchTerms() throws IOException {
            String longTerm = "a".repeat(1000);
            String content = "Short text with " + longTerm + " embedded.";

            testTextFinding(content, longTerm, false, false, new String[]{longTerm}, 1);
        }

        @Test
        @DisplayName("Should handle documents with many pages efficiently")
        void handleManyPages() throws IOException {
            for (int i = 0; i < 10; i++) {
                if (i > 0) { // The first page already exists
                    document.addPage(new PDPage(PDRectangle.A4));
                }
                addTextToPage(document.getPage(i), "Page " + i + " contains searchable content.");
            }

            long startTime = System.currentTimeMillis();
            TextFinder textFinder = new TextFinder("searchable", false, false);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();
            long endTime = System.currentTimeMillis();

            assertEquals(10, foundTexts.size());
            assertTrue(endTime - startTime < 3000,
                "Multi-page search should complete within 3 seconds");
        }
    }

    @Nested
    @DisplayName("Error Handling and Edge Cases")
    class ErrorHandlingTests {

        @Test
        @DisplayName("Should handle null document gracefully")
        void handleNullDocument() throws IOException {
            TextFinder textFinder = new TextFinder("test", false, false);

            try {
                textFinder.getText(null);
                List<PDFText> foundTexts = textFinder.getFoundTexts();
                assertNotNull(foundTexts);
                assertEquals(0, foundTexts.size());
            } catch (Exception e) {
                assertNotNull(e.getMessage());
            }
        }

        @Test
        @DisplayName("Should handle document without pages")
        void handleDocumentWithoutPages() throws IOException {
            try (PDDocument emptyDocument = new PDDocument()) {
                TextFinder textFinder = new TextFinder("test", false, false);
                textFinder.getText(emptyDocument);
                List<PDFText> foundTexts = textFinder.getFoundTexts();
                assertEquals(0, foundTexts.size());
            }
        }

        @Test
        @DisplayName("Should handle pages without content")
        void handlePagesWithoutContent() throws IOException {
            TextFinder textFinder = new TextFinder("test", false, false);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertEquals(0, foundTexts.size());
        }

        @Test
        @DisplayName("Should handle extremely complex regex patterns")
        void handleComplexRegexPatterns() throws IOException {
            addTextToPage("Complex content with various patterns: abc123, def456, XYZ789");

            String complexRegex = "(?=.*\\d)(?=.*[a-z])(?=.*[A-Z])[a-zA-Z\\d]{6}";

            assertDoesNotThrow(() -> {
                TextFinder textFinder = new TextFinder(complexRegex, true, false);
                textFinder.getText(document);
                List<PDFText> foundTexts = textFinder.getFoundTexts();
                assertNotNull(foundTexts);
            });
        }

        @ParameterizedTest
        @ValueSource(strings = {"", " ", "\t", "\n", "\r\n", "   \t\n   "})
        @DisplayName("Should handle whitespace-only search terms")
        void handleWhitespaceSearchTerms(String whitespacePattern) throws IOException {
            addTextToPage("This is normal text content.");

            TextFinder textFinder = new TextFinder(whitespacePattern, false, false);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertEquals(0, foundTexts.size());
        }
    }

    @Nested
    @DisplayName("Text Coordinate Verification")
    class CoordinateTests {

        @Test
        @DisplayName("Should provide accurate text coordinates")
        void provideAccurateCoordinates() throws IOException {
            addTextToPage("Sample text for coordinate testing.");

            TextFinder textFinder = new TextFinder("coordinate", false, false);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertEquals(1, foundTexts.size());
            PDFText foundText = foundTexts.get(0);

            assertTrue(foundText.getX1() >= 0, "X1 should be non-negative");
            assertTrue(foundText.getY1() >= 0, "Y1 should be non-negative");
            assertTrue(foundText.getX2() > foundText.getX1(), "X2 should be greater than X1");
            assertTrue(foundText.getY2() > foundText.getY1(), "Y2 should be greater than Y1");

            double width = foundText.getX2() - foundText.getX1();
            double height = foundText.getY2() - foundText.getY1();

            assertTrue(width > 0, "Text width should be positive");
            assertTrue(height > 0, "Text height should be positive");
            assertTrue(width < 1000, "Text width should be reasonable");
            assertTrue(height < 100, "Text height should be reasonable");
        }

        @Test
        @DisplayName("Should handle overlapping text regions")
        void handleOverlappingTextRegions() throws IOException {
            addTextToPage("Overlapping test text content.");

            TextFinder textFinder = new TextFinder("test", false, false);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertFalse(foundTexts.isEmpty());
            foundTexts.forEach(text -> {
                assertNotNull(text.getText());
                assertTrue(text.getX1() >= 0 && text.getY1() >= 0);
            });
        }
    }

    @Nested
    @DisplayName("Single Character and Digit Tests")
    class SingleCharacterAndDigitTests {

        @Test
        @DisplayName("Should find single digits in various contexts with whole word search")
        void findSingleDigitsWholeWord() throws IOException {
            String content = "Item 1 of 5 costs $2.50. Order number: 1234. Reference: A1B.";
            addTextToPage(content);

            TextFinder textFinder = new TextFinder("1", false, true);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertEquals(1, foundTexts.size(),
                "Should find exactly one standalone '1', not the ones embedded in other numbers/codes");
            assertEquals("1", foundTexts.get(0).getText());
        }

        @Test
        @DisplayName("Should find single digits without whole word search")
        void findSingleDigitsNoWholeWord() throws IOException {
            String content = "Item 1 of 5 costs $2.50. Order number: 1234. Reference: A1B.";
            addTextToPage(content);

            TextFinder textFinder = new TextFinder("1", false, false);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertTrue(foundTexts.size() >= 3,
                "Should find multiple instances of '1' including standalone, in '1234', and in 'A1B'");
        }

        @Test
        @DisplayName("Should find single characters in various contexts")
        void findSingleCharacters() throws IOException {
            String content = "Grade: A. Section B has item A-1. The letter A appears multiple times.";
            addTextToPage(content);

            TextFinder textFinder = new TextFinder("A", false, true);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertTrue(foundTexts.size() >= 2, "Should find multiple standalone 'A' characters");

            for (PDFText found : foundTexts) {
                assertEquals("A", found.getText());
            }
        }

        @Test
        @DisplayName("Should handle digits at word boundaries correctly")
        void findDigitsAtWordBoundaries() throws IOException {
            String content = "Numbers: 1, 2, 3. Code: 123. Version: 1.0. Item1 and Item2.";
            addTextToPage(content);

            TextFinder textFinder1 = new TextFinder("1", false, true);
            textFinder1.getText(document);
            List<PDFText> foundTexts1 = textFinder1.getFoundTexts();

            assertEquals(1, foundTexts1.size(),
                "Should find only the standalone '1' at the beginning");

            TextFinder textFinder2 = new TextFinder("2", false, true);
            textFinder2.getText(document);
            List<PDFText> foundTexts2 = textFinder2.getFoundTexts();

            assertEquals(1, foundTexts2.size(),
                "Should find only the standalone '2' in the number list");
        }

        @Test
        @DisplayName("Should handle special characters and punctuation boundaries")
        void findDigitsWithPunctuationBoundaries() throws IOException {
            String content = "Items: (1), [2], {3}, item#4, price$5, and 6%.";
            addTextToPage(content);

            TextFinder textFinder = new TextFinder("1", false, true);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertEquals(1, foundTexts.size(), "Should find '1' surrounded by parentheses");
            assertEquals("1", foundTexts.get(0).getText());
        }

        @Test
        @DisplayName("Should handle edge case with spacing and formatting")
        void findDigitsWithSpacingIssues() throws IOException {
            String content = "List: 1 , 2  ,  3   and item   1   here.";
            addTextToPage(content);

            TextFinder textFinder = new TextFinder("1", false, true);
            textFinder.getText(document);
            List<PDFText> foundTexts = textFinder.getFoundTexts();

            assertEquals(2, foundTexts.size(),
                "Should find both '1' instances despite spacing variations");
        }
    }

    // Helper methods
    private void addTextToPage(String text) throws IOException {
        addTextToPage(page, text);
    }

    private void addTextToPage(PDPage targetPage, String text) throws IOException {
        try (PDPageContentStream contentStream = new PDPageContentStream(document, targetPage)) {
            contentStream.beginText();
            contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            contentStream.newLineAtOffset(50, 750);
            contentStream.showText(text);
            contentStream.endText();
        }
    }
}
