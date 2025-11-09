package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;

class CbrUtilsTest {

    private CustomPDFDocumentFactory pdfDocumentFactory;
    private TempFileManager tempFileManager;

    @BeforeEach
    void setUp() {
        pdfDocumentFactory = Mockito.mock(CustomPDFDocumentFactory.class);
        tempFileManager = Mockito.mock(TempFileManager.class);
    }

    @Test
    void convertCbrToPdf_nullFile_throwsIllegalArgumentException() {
        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> CbrUtils.convertCbrToPdf(null, pdfDocumentFactory, tempFileManager));

        assertEquals("File cannot be null or empty", exception.getMessage());
    }

    @Test
    void convertCbrToPdf_emptyFile_throwsIllegalArgumentException() {
        MockMultipartFile emptyFile =
                new MockMultipartFile(
                        "file", "empty.cbr", "application/x-rar-compressed", new byte[0]);

        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                CbrUtils.convertCbrToPdf(
                                        emptyFile, pdfDocumentFactory, tempFileManager));

        assertEquals("File cannot be null or empty", exception.getMessage());
    }

    @Test
    void convertCbrToPdf_noFileName_throwsIllegalArgumentException() {
        MultipartFile fileWithoutName = Mockito.mock(MultipartFile.class);
        Mockito.when(fileWithoutName.isEmpty()).thenReturn(false);
        Mockito.when(fileWithoutName.getOriginalFilename()).thenReturn(null);

        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                CbrUtils.convertCbrToPdf(
                                        fileWithoutName, pdfDocumentFactory, tempFileManager));

        assertEquals("File must have a name", exception.getMessage());
    }

    @Test
    void convertCbrToPdf_invalidExtension_throwsIllegalArgumentException() {
        MockMultipartFile invalidExtensionFile =
                new MockMultipartFile("file", "test.txt", "text/plain", new byte[] {1, 2, 3});

        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                CbrUtils.convertCbrToPdf(
                                        invalidExtensionFile, pdfDocumentFactory, tempFileManager));

        assertEquals("File must be a CBR or RAR archive", exception.getMessage());
    }
}
