package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.service.CustomPDFDocumentFactory;

class PDFServiceTest {

    private PDFService pdfService;
    private CustomPDFDocumentFactory mockFactory;
    private final List<PDDocument> documentsToClose = new ArrayList<>();

    @BeforeEach
    void setUp() {
        mockFactory = mock(CustomPDFDocumentFactory.class);
        pdfService = new PDFService(mockFactory);
    }

    @AfterEach
    void tearDown() throws IOException {
        for (PDDocument doc : documentsToClose) {
            try {
                doc.close();
            } catch (Exception ignored) {
            }
        }
    }

    private PDDocument createDocWithPages(int pageCount) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pageCount; i++) {
            doc.addPage(new PDPage());
        }
        documentsToClose.add(doc);
        return doc;
    }

    @Test
    void mergeDocuments_twoDocuments_mergesPages() throws IOException {
        PDDocument merged = new PDDocument();
        documentsToClose.add(merged);
        when(mockFactory.createNewDocument()).thenReturn(merged);

        PDDocument doc1 = createDocWithPages(2);
        PDDocument doc2 = createDocWithPages(3);

        PDDocument result = pdfService.mergeDocuments(List.of(doc1, doc2));
        assertEquals(5, result.getNumberOfPages());
    }

    @Test
    void mergeDocuments_emptyList_returnsEmptyDocument() throws IOException {
        PDDocument merged = new PDDocument();
        documentsToClose.add(merged);
        when(mockFactory.createNewDocument()).thenReturn(merged);

        PDDocument result = pdfService.mergeDocuments(List.of());
        assertEquals(0, result.getNumberOfPages());
    }

    @Test
    void mergeDocuments_singleDocument_returnsSamePages() throws IOException {
        PDDocument merged = new PDDocument();
        documentsToClose.add(merged);
        when(mockFactory.createNewDocument()).thenReturn(merged);

        PDDocument doc1 = createDocWithPages(4);

        PDDocument result = pdfService.mergeDocuments(List.of(doc1));
        assertEquals(4, result.getNumberOfPages());
    }

    @Test
    void mergeDocuments_factoryCalled() throws IOException {
        PDDocument merged = new PDDocument();
        documentsToClose.add(merged);
        when(mockFactory.createNewDocument()).thenReturn(merged);

        PDDocument doc1 = createDocWithPages(1);

        pdfService.mergeDocuments(List.of(doc1));
        verify(mockFactory).createNewDocument();
    }
}
