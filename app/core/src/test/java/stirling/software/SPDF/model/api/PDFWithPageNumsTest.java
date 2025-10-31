package stirling.software.SPDF.model.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PDFWithPageNumsTest {

    private PDFWithPageNums pdfWithPageNums;
    private PDDocument mockDocument;

    @BeforeEach
    void setUp() {
        pdfWithPageNums = new PDFWithPageNums();
        mockDocument = mock(PDDocument.class);
    }

    @Test
    void testGetPageNumbersList_AllPages() {
        pdfWithPageNums.setPageNumbers("all");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = pdfWithPageNums.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10), result);
    }

    @Test
    void testGetPageNumbersList_135_7Pages() {
        pdfWithPageNums.setPageNumbers("1,3,5-7");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = pdfWithPageNums.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(1, 3, 5, 6, 7), result);
    }

    @Test
    void testGetPageNumbersList_2nPlus1Pages() {
        pdfWithPageNums.setPageNumbers("2n+1");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = pdfWithPageNums.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(3, 5, 7, 9), result);
    }

    @Test
    void testGetPageNumbersList_3nPages() {
        pdfWithPageNums.setPageNumbers("3n");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = pdfWithPageNums.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(3, 6, 9), result);
    }

    @Test
    void testGetPageNumbersList_EmptyInput() {
        pdfWithPageNums.setPageNumbers("");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = pdfWithPageNums.getPageNumbersList(mockDocument, true);

        assertTrue(result.isEmpty());
    }

    @Test
    void testGetPageNumbersList_InvalidInput() {
        pdfWithPageNums.setPageNumbers("invalid");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        assertThrows(
                IllegalArgumentException.class,
                () -> {
                    pdfWithPageNums.getPageNumbersList(mockDocument, true);
                });
    }
}
