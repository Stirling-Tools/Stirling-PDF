package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

class PdfToCbzUtilsTest {

    @Test
    void isPdfFile_pdfExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document.pdf");
        assertTrue(PdfToCbzUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_uppercasePdfExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("DOCUMENT.PDF");
        assertTrue(PdfToCbzUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_nonPdfExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document.docx");
        assertFalse(PdfToCbzUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_nullFilename_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn(null);
        assertFalse(PdfToCbzUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_noExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document");
        assertFalse(PdfToCbzUtils.isPdfFile(file));
    }

    @Test
    void convertPdfToCbz_nullFile_throwsException() {
        assertThrows(Exception.class, () -> PdfToCbzUtils.convertPdfToCbz(null, 300, null, null));
    }

    @Test
    void convertPdfToCbz_emptyFile_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(true);
        assertThrows(Exception.class, () -> PdfToCbzUtils.convertPdfToCbz(file, 300, null, null));
    }

    @Test
    void convertPdfToCbz_nonPdfFile_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getOriginalFilename()).thenReturn("image.jpg");
        assertThrows(Exception.class, () -> PdfToCbzUtils.convertPdfToCbz(file, 300, null, null));
    }

    @Test
    void convertPdfToCbz_nullFilename_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getOriginalFilename()).thenReturn(null);
        assertThrows(Exception.class, () -> PdfToCbzUtils.convertPdfToCbz(file, 300, null, null));
    }
}
