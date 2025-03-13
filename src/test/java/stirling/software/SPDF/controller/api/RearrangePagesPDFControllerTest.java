package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import stirling.software.SPDF.service.CustomPDFDocumentFactory;

class RearrangePagesPDFControllerTest {

    @Mock private CustomPDFDocumentFactory mockPdfDocumentFactory;

    private RearrangePagesPDFController sut;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        sut = new RearrangePagesPDFController(mockPdfDocumentFactory);
    }

    /** Tests the behavior of the oddEvenMerge method when there are no pages in the document. */
    @Test
    void oddEvenMerge_noPages() {
        int totalNumberOfPages = 0;

        List<Integer> newPageOrder = sut.oddEvenMerge(totalNumberOfPages);

        assertNotNull(newPageOrder, "Returning null instead of page order list");
        assertEquals(List.of(), newPageOrder, "Page order doesn't match");
    }

    /**
     * Tests the behavior of the oddEvenMerge method when there are odd total pages in the document.
     */
    @Test
    void oddEvenMerge_oddTotalPageNumber() {
        int totalNumberOfPages = 5;

        List<Integer> newPageOrder = sut.oddEvenMerge(totalNumberOfPages);

        assertNotNull(newPageOrder, "Returning null instead of page order list");
        assertEquals(Arrays.asList(0, 3, 1, 4, 2), newPageOrder, "Page order doesn't match");
    }

    /**
     * Tests the behavior of the oddEvenMerge method when there are even total pages in the
     * document.
     */
    @Test
    void oddEvenMerge_evenTotalPageNumber() {
        int totalNumberOfPages = 6;

        List<Integer> newPageOrder = sut.oddEvenMerge(totalNumberOfPages);

        assertNotNull(newPageOrder, "Returning null instead of page order list");
        assertEquals(Arrays.asList(0, 3, 1, 4, 2, 5), newPageOrder, "Page order doesn't match");
    }

    /**
     * Tests the behavior of the oddEvenMerge method with multiple test cases of multiple pages.
     *
     * @param totalNumberOfPages The total number of pages in the document.
     * @param expectedPageOrder The expected order of the pages after rearranging.
     */
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
    void oddEvenMerge_multi_test(int totalNumberOfPages, String expectedPageOrder) {
        List<Integer> newPageOrder = sut.oddEvenMerge(totalNumberOfPages);

        assertNotNull(newPageOrder, "Returning null instead of page order list");
        assertEquals(
                Arrays.stream(expectedPageOrder.split(",")).map(Integer::parseInt).toList(),
                newPageOrder,
                "Page order doesn't match");
    }
}
