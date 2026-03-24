package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.BookletImpositionRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class BookletImpositionControllerTest {

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @InjectMocks private BookletImpositionController controller;

    private MockMultipartFile createRealPdf(int numPages) throws IOException {
        Path path = tempDir.resolve("test.pdf");
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                doc.addPage(new PDPage(PDRectangle.LETTER));
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, Files.readAllBytes(path));
    }

    private BookletImpositionRequest createRequest(MockMultipartFile file) {
        BookletImpositionRequest req = new BookletImpositionRequest();
        req.setFileInput(file);
        req.setPagesPerSheet(2);
        return req;
    }

    @Test
    void createBookletImposition_basicSuccess() throws IOException {
        MockMultipartFile file = createRealPdf(4);
        BookletImpositionRequest request = createRequest(file);

        PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        ResponseEntity<byte[]> response = controller.createBookletImposition(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotEmpty();
        try (PDDocument result = Loader.loadPDF(response.getBody())) {
            assertThat(result.getNumberOfPages()).isGreaterThan(0);
        }
    }

    @Test
    void createBookletImposition_invalidPagesPerSheet() throws IOException {
        MockMultipartFile file = createRealPdf(4);
        BookletImpositionRequest request = createRequest(file);
        request.setPagesPerSheet(4);

        assertThatThrownBy(() -> controller.createBookletImposition(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("2 pages per side");
    }

    @Test
    void createBookletImposition_withBorder() throws IOException {
        MockMultipartFile file = createRealPdf(4);
        BookletImpositionRequest request = createRequest(file);
        request.setAddBorder(true);

        PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        ResponseEntity<byte[]> response = controller.createBookletImposition(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotEmpty();
    }

    @Test
    void createBookletImposition_rightSpine() throws IOException {
        MockMultipartFile file = createRealPdf(4);
        BookletImpositionRequest request = createRequest(file);
        request.setSpineLocation("RIGHT");

        PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        ResponseEntity<byte[]> response = controller.createBookletImposition(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void createBookletImposition_withGutter() throws IOException {
        MockMultipartFile file = createRealPdf(4);
        BookletImpositionRequest request = createRequest(file);
        request.setAddGutter(true);
        request.setGutterSize(20f);

        PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        ResponseEntity<byte[]> response = controller.createBookletImposition(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void createBookletImposition_doubleSidedFirstPass() throws IOException {
        MockMultipartFile file = createRealPdf(8);
        BookletImpositionRequest request = createRequest(file);
        request.setDoubleSided(true);
        request.setDuplexPass("FIRST");

        PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        ResponseEntity<byte[]> response = controller.createBookletImposition(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void createBookletImposition_doubleSidedSecondPass() throws IOException {
        MockMultipartFile file = createRealPdf(8);
        BookletImpositionRequest request = createRequest(file);
        request.setDoubleSided(true);
        request.setDuplexPass("SECOND");

        PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        ResponseEntity<byte[]> response = controller.createBookletImposition(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void createBookletImposition_flipOnShortEdge() throws IOException {
        MockMultipartFile file = createRealPdf(4);
        BookletImpositionRequest request = createRequest(file);
        request.setDoubleSided(true);
        request.setFlipOnShortEdge(true);

        PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        ResponseEntity<byte[]> response = controller.createBookletImposition(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void createBookletImposition_singlePage() throws IOException {
        MockMultipartFile file = createRealPdf(1);
        BookletImpositionRequest request = createRequest(file);

        PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        ResponseEntity<byte[]> response = controller.createBookletImposition(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void createBookletImposition_ioException() throws IOException {
        MockMultipartFile file = createRealPdf(4);
        BookletImpositionRequest request = createRequest(file);

        when(pdfDocumentFactory.load(file)).thenThrow(new IOException("load error"));

        assertThatThrownBy(() -> controller.createBookletImposition(request))
                .isInstanceOf(IOException.class);
    }

    @Test
    void createBookletImposition_negativeGutterClamped() throws IOException {
        MockMultipartFile file = createRealPdf(4);
        BookletImpositionRequest request = createRequest(file);
        request.setAddGutter(true);
        request.setGutterSize(-10f);

        PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        ResponseEntity<byte[]> response = controller.createBookletImposition(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
