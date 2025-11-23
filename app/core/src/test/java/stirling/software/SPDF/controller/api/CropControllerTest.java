package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.CropPdfForm;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;

@ExtendWith(MockitoExtension.class)
class CropControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private CropController cropController;

    @Test
    void cropPdf_usesPdfBoxWhenRemovingDataIsDisabled() throws IOException {
        MockMultipartFile mockFile =
                new MockMultipartFile(
                        "file",
                        "sample.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        new byte[] {1, 2, 3});

        CropPdfForm request = new CropPdfForm();
        request.setFileInput(mockFile);
        request.setX(10);
        request.setY(20);
        request.setWidth(150);
        request.setHeight(200);
        request.setRemoveDataOutsideCrop(false);

        PDDocument sourceDocument = new PDDocument();
        sourceDocument.addPage(new PDPage(new PDRectangle(250, 300)));

        PDDocument newDocument = new PDDocument();

        when(pdfDocumentFactory.load(request)).thenReturn(sourceDocument);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument))
                .thenReturn(newDocument);

        ResponseEntity<byte[]> response = cropController.cropPdf(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().length > 0);

        ContentDisposition disposition = response.getHeaders().getContentDisposition();
        assertEquals("sample_cropped.pdf", disposition.getFilename());

        try (PDDocument result = Loader.loadPDF(response.getBody())) {
            assertEquals(1, result.getNumberOfPages());
            PDRectangle mediaBox = result.getPage(0).getMediaBox();
            assertEquals(150, mediaBox.getWidth(), 0.1f);
            assertEquals(200, mediaBox.getHeight(), 0.1f);
        }

        verify(pdfDocumentFactory).load(request);
        verify(pdfDocumentFactory).createNewDocumentBasedOnOldDocument(sourceDocument);
    }

    @Test
    void cropPdf_usesGhostscriptWhenRemovingDataIsEnabled() throws Exception {
        MockMultipartFile mockFile =
                new MockMultipartFile(
                        "file", "ghost.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {4, 5, 6});

        CropPdfForm request = new CropPdfForm();
        request.setFileInput(mockFile);
        request.setX(0);
        request.setY(0);
        request.setWidth(200);
        request.setHeight(200);
        request.setRemoveDataOutsideCrop(true);

        PDDocument sourceDocument = new PDDocument();
        sourceDocument.addPage(new PDPage());

        when(pdfDocumentFactory.load(request)).thenReturn(sourceDocument);

        ProcessExecutor processExecutor = mock(ProcessExecutor.class);
        ArgumentCaptor<List<String>> commandCaptor = ArgumentCaptor.forClass(List.class);

        try (MockedStatic<ProcessExecutor> utilities = mockStatic(ProcessExecutor.class)) {
            utilities
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT))
                    .thenReturn(processExecutor);
            when(processExecutor.runCommandWithOutputHandling(anyList())).thenReturn(null);

            ResponseEntity<byte[]> response = cropController.cropPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            ContentDisposition disposition = response.getHeaders().getContentDisposition();
            assertEquals("ghost_cropped.pdf", disposition.getFilename());
        }

        verify(processExecutor).runCommandWithOutputHandling(commandCaptor.capture());
        List<String> command = commandCaptor.getValue();
        assertEquals("gs", command.get(0));
        assertTrue(command.contains("-dUseCropBox"));
    }
}
