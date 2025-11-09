package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.PdfMetadata;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

@ExtendWith(MockitoExtension.class)
class SplitPdfByChaptersControllerTest {

    @Mock private PdfMetadataService pdfMetadataService;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private SplitPdfByChaptersController splitPdfByChaptersController;

    @Test
    void getSplitDocumentsBoas_includesMetadataWhenRequested() throws Exception {
        try (PDDocument sourceDocument = new PDDocument()) {
            sourceDocument.addPage(new PDPage());
            sourceDocument.addPage(new PDPage());

            List<Bookmark> bookmarks =
                    List.of(new Bookmark("Chapter 1", 0, 0), new Bookmark("Chapter 2", 1, 1));

            PdfMetadata metadata = new PdfMetadata();
            when(pdfMetadataService.extractMetadataFromPdf(sourceDocument)).thenReturn(metadata);

            List<ByteArrayOutputStream> result =
                    splitPdfByChaptersController.getSplitDocumentsBoas(
                            sourceDocument, bookmarks, true);

            assertEquals(2, result.size());
            assertTrue(result.stream().allMatch(stream -> stream.size() > 0));

            verify(pdfMetadataService, times(1)).extractMetadataFromPdf(sourceDocument);
            verify(pdfMetadataService, times(2))
                    .setMetadataToPdf(any(PDDocument.class), eq(metadata));
        }
    }

    @Test
    void getSplitDocumentsBoas_splitsEachBookmarkWithoutMetadata() throws Exception {
        try (PDDocument sourceDocument = new PDDocument()) {
            sourceDocument.addPage(new PDPage());
            sourceDocument.addPage(new PDPage());
            sourceDocument.addPage(new PDPage());

            List<Bookmark> bookmarks =
                    List.of(
                            new Bookmark("Chapter 1", 0, 0),
                            new Bookmark("Chapter 2", 1, 1),
                            new Bookmark("Chapter 3", 2, 2));

            List<ByteArrayOutputStream> result =
                    splitPdfByChaptersController.getSplitDocumentsBoas(
                            sourceDocument, bookmarks, false);

            assertEquals(3, result.size());

            for (ByteArrayOutputStream baos : result) {
                try (PDDocument split = Loader.loadPDF(baos.toByteArray())) {
                    assertEquals(1, split.getNumberOfPages());
                }
            }

            verify(pdfMetadataService, never()).extractMetadataFromPdf(any(PDDocument.class));
            verify(pdfMetadataService, never()).setMetadataToPdf(any(PDDocument.class), any());
        }
    }
}
