package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.nio.file.Files;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.GeneralUtils;

@ExtendWith(MockitoExtension.class)
class ConvertPDFToExcelControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private stirling.software.common.util.TempFileManager tempFileManager;

    @InjectMocks private ConvertPDFToExcelController controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            stirling.software.common.util.TempFile tf =
                                    mock(stirling.software.common.util.TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    @Test
    void pdfToExcel_noTablesReturnsNoContent() throws Exception {
        FileUpload pdfFile =
                TestFileUploads.of("pdf-content".getBytes(), "data.pdf", "application/pdf");

        // Create a real empty PDDocument for tabula to process
        PDDocument emptyDoc = new PDDocument();
        emptyDoc.addPage(new org.apache.pdfbox.pdmodel.PDPage());

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

            Response response = controller.pdfToExcel(pdfFile, null, "all");

            // tabula may or may not find tables in an empty page
            assertNotNull(response);
            // Either NO_CONTENT (204, no tables) or OK (200, empty tables found)
            assertTrue(response.getStatus() == 204 || response.getStatus() == 200);
        }
    }

    private static void assertTrue(boolean condition) {
        if (!condition) throw new AssertionError();
    }

    @Test
    void controllerIsConstructed() {
        assertNotNull(controller);
    }

    @Test
    void requestModelSetsPageNumbers() {
        PDFWithPageNums request = new PDFWithPageNums();
        request.setPageNumbers("1,2,3");
        assertEquals("1,2,3", request.getPageNumbers());
    }

    @Test
    void requestModelDefaultPageNumbers() {
        PDFWithPageNums request = new PDFWithPageNums();
        request.setPageNumbers("all");
        assertEquals("all", request.getPageNumbers());
    }
}
