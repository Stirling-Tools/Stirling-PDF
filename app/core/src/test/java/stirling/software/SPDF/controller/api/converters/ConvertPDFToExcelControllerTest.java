package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils.NothingToExtractException;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ConvertPDFToExcelControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private OfficeConversionService officeConversionService;

    @InjectMocks private ConvertPDFToExcelController controller;

    @BeforeEach
    void setUp() throws Exception {
        // These cover the legacy converters; Stirling Office Convert has its own tests.
        lenient().when(officeConversionService.legacy(null)).thenReturn(true);
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
    void pdfToExcel_noTablesRefuses() throws Exception {
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

            assertThrows(
                    NothingToExtractException.class, () -> controller.pdfToExcel(request, null));
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
