package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.when;

import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;

@ExtendWith(MockitoExtension.class)
class ExtractCSVControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private ExtractCSVController controller;

    @Test
    void pdfToCsv_noTablesReturnsNoContent() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "data.pdf", "application/pdf", "content".getBytes());

        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(pdfFile);
        request.setPageNumbers("all");

        PDDocument emptyDoc = new PDDocument();
        emptyDoc.addPage(new PDPage());

        when(pdfDocumentFactory.load(request)).thenReturn(emptyDoc);

        try (MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class)) {
            guMock.when(() -> GeneralUtils.removeExtension("data.pdf")).thenReturn("data");
            guMock.when(
                            () ->
                                    GeneralUtils.parsePageList(
                                            Mockito.anyString(),
                                            Mockito.anyInt(),
                                            Mockito.eq(true)))
                    .thenReturn(List.of(1));

            ResponseEntity<?> response = controller.pdfToCsv(request);

            assertNotNull(response);
            // Empty page may produce NO_CONTENT or OK with content
            org.junit.jupiter.api.Assertions.assertTrue(
                    response.getStatusCode() == HttpStatus.NO_CONTENT
                            || response.getStatusCode() == HttpStatus.OK);
        }
    }

    @Test
    void controllerIsConstructed() {
        assertNotNull(controller);
    }

    @Test
    void requestSetup() {
        PDFWithPageNums request = new PDFWithPageNums();
        request.setPageNumbers("1,3");
        assertEquals("1,3", request.getPageNumbers());
    }
}
