package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

class CbzUtilsTest {

    // --- isCbzFile tests ---

    @Test
    void isCbzFile_withCbzExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("comic.cbz");
        assertTrue(CbzUtils.isCbzFile(file));
    }

    @Test
    void isCbzFile_withZipExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("archive.zip");
        assertTrue(CbzUtils.isCbzFile(file));
    }

    @Test
    void isCbzFile_withUpperCaseExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("comic.CBZ");
        assertTrue(CbzUtils.isCbzFile(file));
    }

    @Test
    void isCbzFile_withPdfExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document.pdf");
        assertFalse(CbzUtils.isCbzFile(file));
    }

    @Test
    void isCbzFile_withNullFilename_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn(null);
        assertFalse(CbzUtils.isCbzFile(file));
    }

    @Test
    void isCbzFile_withCbrExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("comic.cbr");
        assertFalse(CbzUtils.isCbzFile(file));
    }

    // --- isComicBookFile tests ---

    @Test
    void isComicBookFile_withCbzExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("comic.cbz");
        assertTrue(CbzUtils.isComicBookFile(file));
    }

    @Test
    void isComicBookFile_withZipExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("archive.zip");
        assertTrue(CbzUtils.isComicBookFile(file));
    }

    @Test
    void isComicBookFile_withCbrExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("comic.cbr");
        assertTrue(CbzUtils.isComicBookFile(file));
    }

    @Test
    void isComicBookFile_withRarExtension_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("archive.rar");
        assertTrue(CbzUtils.isComicBookFile(file));
    }

    @Test
    void isComicBookFile_withPdfExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document.pdf");
        assertFalse(CbzUtils.isComicBookFile(file));
    }

    @Test
    void isComicBookFile_withNullFilename_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn(null);
        assertFalse(CbzUtils.isComicBookFile(file));
    }

    @Test
    void isComicBookFile_withUpperCaseCBR_returnsTrue() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("comic.CBR");
        assertTrue(CbzUtils.isComicBookFile(file));
    }

    @Test
    void isComicBookFile_withNoExtension_returnsFalse() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("noextension");
        assertFalse(CbzUtils.isComicBookFile(file));
    }

    // --- convertCbzToPdf validation tests ---

    @Test
    void convertCbzToPdf_withNullFile_throwsException() {
        assertThrows(Exception.class, () -> CbzUtils.convertCbzToPdf(null, null, null, false));
    }

    @Test
    void convertCbzToPdf_withEmptyFile_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(true);
        assertThrows(Exception.class, () -> CbzUtils.convertCbzToPdf(file, null, null, false));
    }

    @Test
    void convertCbzToPdf_withNullFilename_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getOriginalFilename()).thenReturn(null);
        assertThrows(Exception.class, () -> CbzUtils.convertCbzToPdf(file, null, null, false));
    }

    @Test
    void convertCbzToPdf_withWrongExtension_throwsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getOriginalFilename()).thenReturn("file.pdf");
        assertThrows(Exception.class, () -> CbzUtils.convertCbzToPdf(file, null, null, false));
    }
}
