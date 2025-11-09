package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.api.general.RearrangePagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith({MockitoExtension.class})
class RearrangePagesPDFControllerTest {

    @Mock private CustomPDFDocumentFactory mockPdfDocumentFactory;

    private RearrangePagesPDFController sut;

    @BeforeEach
    void setUp() {
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

    @ParameterizedTest
    @MethodSource("processSortTypesProvider")
    void processSortTypes_generatesExpectedOrder(
            String sortType, int totalPages, String pageOrder, List<Integer> expectedOrder) {
        List<Integer> result = invokeProcessSortTypes(sortType, totalPages, pageOrder);

        assertNotNull(result, "processSortTypes returned null");
        assertEquals(expectedOrder, result, "Unexpected page order for sort type" + sortType);
    }

    static Stream<Arguments> processSortTypesProvider() {
        return Stream.of(
                Arguments.of("reverse_order", 4, null, List.of(3, 2, 1, 0)),
                Arguments.of("duplex_sort", 5, null, List.of(0, 4, 1, 3, 2)),
                Arguments.of("booklet_sort", 6, null, List.of(0, 5, 1, 4, 2, 3)),
                Arguments.of("side_stitch_booklet_sort", 5, null, List.of(3, 0, 1, 2, 4, 4, 4, 4)),
                Arguments.of("odd_even_split", 6, null, List.of(0, 2, 4, 1, 3, 5)),
                Arguments.of("odd_even_merge", 5, null, List.of(0, 3, 1, 4, 2)),
                Arguments.of("remove_first", 4, null, List.of(1, 2, 3)),
                Arguments.of("remove_last", 4, null, List.of(0, 1, 2)),
                Arguments.of("remove_first_and_last", 5, null, List.of(1, 2, 3)),
                Arguments.of("duplicate", 3, "3", List.of(0, 0, 0, 1, 1, 1, 2, 2, 2)),
                Arguments.of("duplicate", 2, "-1", List.of(0, 0, 1, 1)),
                Arguments.of("duplicate", 2, "abc", List.of(0, 0, 1, 1)),
                Arguments.of("duplicate", 2, null, List.of(0, 0, 1, 1)));
    }

    @Test
    void processSortTypes_invalidModeReturnsNull() {
        List<Integer> result = invokeProcessSortTypes("non_existing_mode", 3, null);

        assertNull(result, "Unsupported mode should return null");
    }

    @Test
    void deletePages_removesRequestedPages() throws Exception {
        PDDocument document = new PDDocument();
        try {
            for (int i = 0; i < 3; i++) {
                document.addPage(new PDPage());
            }
            PDDocument spyDocument = Mockito.spy(document);
            when(mockPdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(spyDocument);

            PDFWithPageNums request = new PDFWithPageNums();
            request.setFileInput(
                    new MockMultipartFile(
                            "fileInput",
                            "sample.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            new byte[] {1, 2, 3}));
            request.setPageNumbers("1,3");

            ResponseEntity<byte[]> response = sut.deletePages(request);

            assertNotNull(response.getBody(), "Response body should not be null");

            verify(spyDocument).removePage(2);
            verify(spyDocument).removePage(0);
            try (PDDocument result = Loader.loadPDF(response.getBody())) {
                assertEquals(
                        1, result.getNumberOfPages(), "Unexpected number of pages after delete");
            }
        } finally {
            document.close();
        }
    }

    @Test
    void rearrangePages_withSortTypeReordersPages() throws Exception {
        PDDocument document = new PDDocument();
        PDDocument rearrangedDocument = new PDDocument();
        try {
            for (int i = 0; i < 4; i++) {
                document.addPage(new PDPage());
            }
            PDDocument spyDocument = Mockito.spy(document);
            when(mockPdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(spyDocument);
            when(mockPdfDocumentFactory.createNewDocumentBasedOnOldDocument(spyDocument))
                    .thenReturn(rearrangedDocument);

            RearrangePagesRequest request = new RearrangePagesRequest();
            request.setFileInput(
                    new MockMultipartFile(
                            "fileInput",
                            "input.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            new byte[] {5, 4, 3}));
            request.setPageNumbers(null);
            request.setCustomMode("reverse_order");

            ResponseEntity<byte[]> response = sut.rearrangePages(request);

            assertNotNull(response.getBody(), "Response body should not be null");
            try (PDDocument result = Loader.loadPDF(response.getBody())) {
                assertEquals(4, result.getNumberOfPages(), "Unexpected number of pages returned");
            }

            InOrder inOrder = inOrder(spyDocument);
            inOrder.verify(spyDocument).getPage(3);
            inOrder.verify(spyDocument).getPage(2);
            inOrder.verify(spyDocument).getPage(1);
            inOrder.verify(spyDocument).getPage(0);
            verify(mockPdfDocumentFactory).createNewDocumentBasedOnOldDocument(spyDocument);
        } finally {
            document.close();
            rearrangedDocument.close();
        }
    }

    @Test
    void rearrangePages_whenLoadFails_propagatesIOException() throws IOException {
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1}));
        request.setPageNumbers("0");
        request.setCustomMode("custom");

        when(mockPdfDocumentFactory.load(any(MultipartFile.class)))
                .thenThrow(new IOException("Load failed"));

        assertThrows(IOException.class, () -> sut.rearrangePages(request));
    }

    private List<Integer> invokeProcessSortTypes(
            String sortType, int totalPages, String pageOrder) {
        try {
            Method method =
                    RearrangePagesPDFController.class.getDeclaredMethod(
                            "processSortTypes", String.class, int.class, String.class);
            method.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<Integer> result =
                    (List<Integer>) method.invoke(sut, sortType, totalPages, pageOrder);
            return result;
        } catch (ReflectiveOperationException e) {
            fail("Failed to invoke processSortTypes", e);
            return List.of();
        }
    }
}
