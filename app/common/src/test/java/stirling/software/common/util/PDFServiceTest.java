package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Collections;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class PDFServiceTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private PDFService pdfService;

    @Test
    void mergeDocumentsShouldCombineAllPagesFromInputDocuments() throws IOException {
        try (PDDocument mergedDocument = new PDDocument();
                PDDocument first = new PDDocument();
                PDDocument second = new PDDocument()) {
            first.addPage(new PDPage());
            second.addPage(new PDPage());
            second.addPage(new PDPage());

            when(pdfDocumentFactory.createNewDocument()).thenReturn(mergedDocument);

            PDDocument result = pdfService.mergeDocuments(List.of(first, second));

            assertThat(result).isSameAs(mergedDocument);
            assertThat(result.getNumberOfPages()).isEqualTo(3);
            verify(pdfDocumentFactory).createNewDocument();
        }
    }

    @Test
    void mergeDocumentsWithEmptyListReturnsEmptyDocument() throws IOException {
        try (PDDocument mergedDocument = new PDDocument()) {
            when(pdfDocumentFactory.createNewDocument()).thenReturn(mergedDocument);

            PDDocument result = pdfService.mergeDocuments(Collections.emptyList());

            assertThat(result).isSameAs(mergedDocument);
            assertThat(result.getNumberOfPages()).isZero();
            verify(pdfDocumentFactory).createNewDocument();
        }
    }
}
