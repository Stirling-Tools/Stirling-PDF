package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.PDFService;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class SplitPdfBySectionsControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private PDFService pdfService;

    @InjectMocks private SplitPdfBySectionsController controller;

    @Test
    void splitPdfPages_splitsSpecifiedPagesIntoExpectedSubsections() throws IOException {
        PDRectangle originalSize = new PDRectangle(200, 300);

        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(originalSize));
            document.addPage(new PDPage(originalSize));

            Mockito.when(pdfDocumentFactory.createNewDocument())
                    .thenAnswer(invocation -> new PDDocument());

            Set<Integer> pagesToSplit = new HashSet<>();
            pagesToSplit.add(1);

            List<PDDocument> result = controller.splitPdfPages(document, 2, 2, pagesToSplit);

            assertEquals(5, result.size(), "Expected one original page plus four sub-pages");

            PDDocument preservedDocument = result.get(0);
            assertEquals(1, preservedDocument.getNumberOfPages());
            PDRectangle preservedSize = preservedDocument.getPage(0).getMediaBox();
            assertEquals(originalSize.getWidth(), preservedSize.getWidth(), 0.01f);
            assertEquals(originalSize.getHeight(), preservedSize.getHeight(), 0.01f);

            float expectedWidth = originalSize.getWidth() / 2;
            float expectedHeight = originalSize.getHeight() / 2;

            for (int i = 1; i < result.size(); i++) {
                PDDocument splitDoc = result.get(i);
                assertEquals(
                        1, splitDoc.getNumberOfPages(), "Each split section should be one page");
                PDRectangle subSize = splitDoc.getPage(0).getMediaBox();
                assertEquals(expectedWidth, subSize.getWidth(), 0.01f);
                assertEquals(expectedHeight, subSize.getHeight(), 0.01f);
            }

            Mockito.verify(pdfDocumentFactory, Mockito.times(1)).createNewDocument();

            for (PDDocument doc : result) {
                doc.close();
            }
        }
    }

    @Test
    void splitPdfPages_returnsOriginalPagesWhenNothingToSplit() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage pageOne = new PDPage();
            PDPage pageTwo = new PDPage();
            document.addPage(pageOne);
            document.addPage(pageTwo);

            Mockito.when(pdfDocumentFactory.createNewDocument())
                    .thenAnswer(invocation -> new PDDocument());

            List<PDDocument> result = controller.splitPdfPages(document, 1, 1, Set.of());

            assertEquals(2, result.size(), "Expected a document for each original page");
            for (PDDocument doc : result) {
                assertEquals(1, doc.getNumberOfPages());
                doc.close();
            }

            Mockito.verify(pdfDocumentFactory, Mockito.times(2)).createNewDocument();
        }
    }
}
