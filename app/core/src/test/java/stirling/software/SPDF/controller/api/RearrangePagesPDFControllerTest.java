package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import stirling.software.common.service.CustomPDFDocumentFactory;

@DisplayName("RearrangePagesPDFController Tests")
class RearrangePagesPDFControllerTest {

    @Mock private CustomPDFDocumentFactory mockPdfDocumentFactory;

    private RearrangePagesPDFController sut;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        sut = new RearrangePagesPDFController(mockPdfDocumentFactory);
    }

    @Nested
    @DisplayName("Odd-Even Merge Tests")
    class OddEvenMergeTests {

        @Test
        @DisplayName("Returns empty list when document has no pages")
        void oddEvenMerge_noPages() {
            // Arrange
            int totalNumberOfPages = 0;

            // Act
            List<Integer> newPageOrder = sut.oddEvenMerge(totalNumberOfPages);

            // Assert
            assertNotNull(newPageOrder, "Returning null instead of page order list");
            assertEquals(List.of(), newPageOrder, "Page order should be empty for no pages");
        }

        @Test
        @DisplayName("Correctly rearranges pages when total page count is odd")
        void oddEvenMerge_oddTotalPageNumber() {
            // Arrange
            int totalNumberOfPages = 5;

            // Act
            List<Integer> newPageOrder = sut.oddEvenMerge(totalNumberOfPages);

            // Assert
            assertNotNull(newPageOrder, "Returning null instead of page order list");
            assertEquals(Arrays.asList(0, 3, 1, 4, 2), newPageOrder, "Page order doesn't match for odd page count");
        }

        @Test
        @DisplayName("Correctly rearranges pages when total page count is even")
        void oddEvenMerge_evenTotalPageNumber() {
            // Arrange
            int totalNumberOfPages = 6;

            // Act
            List<Integer> newPageOrder = sut.oddEvenMerge(totalNumberOfPages);

            // Assert
            assertNotNull(newPageOrder, "Returning null instead of page order list");
            assertEquals(Arrays.asList(0, 3, 1, 4, 2, 5), newPageOrder, "Page order doesn't match for even page count");
        }

        @ParameterizedTest
        @CsvSource({
            "1, '0'",
            "2, '0,1'",
            "3, '0,2,1'",
            "4, '0,2,1,3'",
            "5, '0,3,1,4,2'",
            "6, '0,3,1,4,2,5'",
            "10, '0,5,1,6,2,7,3,8,4,9'",
            "50, '0,25,1,26,2,27,3,28,4,29,5,30,6,31,7,32,8,33,9,34,10,35,"
                + "11,36,12,37,13,38,14,39,15,40,16,41,17,42,18,43,19,44,20,45,21,46,"
                + "22,47,23,48,24,49'"
        })
        @DisplayName("Correctly rearranges pages for various page counts")
        void oddEvenMerge_multi_test(int totalNumberOfPages, String expectedPageOrder) {
            // Act
            List<Integer> newPageOrder = sut.oddEvenMerge(totalNumberOfPages);

            // Assert
            assertNotNull(newPageOrder, "Returning null instead of page order list");
            assertEquals(
                Arrays.stream(expectedPageOrder.split(",")).map(Integer::parseInt).toList(),
                newPageOrder,
                "Page order doesn't match for page count " + totalNumberOfPages);
        }
    }
}
