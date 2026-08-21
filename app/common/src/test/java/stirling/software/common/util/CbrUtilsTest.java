package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

class CbrUtilsTest {

    // --- isCbrFile tests ---

    @Test
    void isCbrFile_withCbrExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("comic.cbr");
        assertTrue(CbrUtils.isCbrFile(file));
    }

    @Test
    void isCbrFile_withRarExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("archive.rar");
        assertTrue(CbrUtils.isCbrFile(file));
    }

    @Test
    void isCbrFile_withUpperCaseExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("comic.CBR");
        assertTrue(CbrUtils.isCbrFile(file));
    }

    @Test
    void isCbrFile_withPdfExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document.pdf");
        assertFalse(CbrUtils.isCbrFile(file));
    }

    @Test
    void isCbrFile_withNullFilename_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn(null);
        assertFalse(CbrUtils.isCbrFile(file));
    }

    @Test
    void isCbrFile_withCbzExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("comic.cbz");
        assertFalse(CbrUtils.isCbrFile(file));
    }

    @Test
    void isCbrFile_withNoExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("noextension");
        assertFalse(CbrUtils.isCbrFile(file));
    }

    @Test
    void isCbrFile_withMixedCaseRar_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("file.RaR");
        assertTrue(CbrUtils.isCbrFile(file));
    }

    // --- convertCbrToPdf validation tests ---

    @Test
    void convertCbrToPdf_withNullFile_throwsException() {
        assertThrows(Exception.class, () -> CbrUtils.convertCbrToPdf(null, null, null));
    }

    @Test
    void convertCbrToPdf_withEmptyFile_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(true);
        assertThrows(Exception.class, () -> CbrUtils.convertCbrToPdf(file, null, null));
    }

    @Test
    void convertCbrToPdf_withNullFilename_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getOriginalFilename()).thenReturn(null);
        assertThrows(Exception.class, () -> CbrUtils.convertCbrToPdf(file, null, null));
    }

    @Test
    void convertCbrToPdf_withWrongExtension_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getOriginalFilename()).thenReturn("file.pdf");
        assertThrows(Exception.class, () -> CbrUtils.convertCbrToPdf(file, null, null));
    }
}
