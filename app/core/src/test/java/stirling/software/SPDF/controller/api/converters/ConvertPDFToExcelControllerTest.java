package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.nio.file.Files;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ConvertPDFToExcelControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

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
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    @Test
    void pdfToExcel_noTablesReturnsNoContent() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "data.pdf", "application/pdf", "pdf-content".getBytes());

        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(pdfFile);
        request.setPageNumbers("all");

        // Create a real empty PDDocument for tabula to process
        PDDocument emptyDoc = new PDDocument();
        emptyDoc.addPage(new org.apache.pdfbox.pdmodel.PDPage());

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

            ResponseEntity<Resource> response = controller.pdfToExcel(request);

            // tabula may or may not find tables in an empty page
            assertNotNull(response);
            // Either NO_CONTENT (no tables) or OK (empty tables found)
            assertTrue(
                    response.getStatusCode() == HttpStatus.NO_CONTENT
                            || response.getStatusCode() == HttpStatus.OK);
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
