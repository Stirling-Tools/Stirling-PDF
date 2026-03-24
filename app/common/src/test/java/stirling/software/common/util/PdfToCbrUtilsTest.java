package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

class PdfToCbrUtilsTest {

    @Test
    void isPdfFile_pdfExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document.pdf");
        assertTrue(PdfToCbrUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_uppercasePdfExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document.PDF");
        assertTrue(PdfToCbrUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_mixedCasePdfExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document.Pdf");
        assertTrue(PdfToCbrUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_nonPdfExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document.txt");
        assertFalse(PdfToCbrUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_nullFilename_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn(null);
        assertFalse(PdfToCbrUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_imageExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("image.png");
        assertFalse(PdfToCbrUtils.isPdfFile(file));
    }

    @Test
    void convertPdfToCbr_nullFile_throwsException() {
        assertThrows(Exception.class, () -> PdfToCbrUtils.convertPdfToCbr(null, 300, null));
    }

    @Test
    void convertPdfToCbr_emptyFile_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(true);
        assertThrows(Exception.class, () -> PdfToCbrUtils.convertPdfToCbr(file, 300, null));
    }

    @Test
    void convertPdfToCbr_nonPdfFile_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getOriginalFilename()).thenReturn("image.png");
        assertThrows(Exception.class, () -> PdfToCbrUtils.convertPdfToCbr(file, 300, null));
    }

    @Test
    void convertPdfToCbr_nullFilename_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getOriginalFilename()).thenReturn(null);
        assertThrows(Exception.class, () -> PdfToCbrUtils.convertPdfToCbr(file, 300, null));
    }
}
