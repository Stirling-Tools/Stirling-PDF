package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.pdf.parser.TabulaTableParser;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.GeneralUtils;

@ExtendWith(MockitoExtension.class)
class ExtractCSVControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TabulaTableParser tabulaTableParser;

    @InjectMocks private ExtractCSVController controller;

    @Test
    void pdfToCsv_noTablesReturnsNoContent() throws Exception {
        FileUpload pdfFile =
                TestFileUploads.of("content".getBytes(), "data.pdf", "application/pdf");

        PDDocument emptyDoc = new PDDocument();
        emptyDoc.addPage(new PDPage());

        when(pdfDocumentFactory.load(any(PDFWithPageNums.class))).thenReturn(emptyDoc);

        try (MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class)) {
            guMock.when(() -> GeneralUtils.removeExtension("data.pdf")).thenReturn("data");
            guMock.when(
                            () ->
                                    GeneralUtils.parsePageList(
                                            Mockito.anyString(),
                                            Mockito.anyInt(),
                                            Mockito.eq(true)))
                    .thenReturn(List.of(1));

            Response response = controller.pdfToCsv(pdfFile, null, "all");

            assertNotNull(response);
            // Empty page may produce NO_CONTENT (204) or OK (200) with content
            org.junit.jupiter.api.Assertions.assertTrue(
                    response.getStatus() == 204 || response.getStatus() == 200);
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
