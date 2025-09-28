package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.util.CbzUtils;

class CbzUtilsTest {

    @Test
    void testIsCbzFile_ValidCbzFile() {
        MockMultipartFile cbzFile =
                new MockMultipartFile(
                        "file", "test.cbz", "application/zip", "test content".getBytes());

        assertTrue(CbzUtils.isCbzFile(cbzFile));
    }

    @Test
    void testIsCbzFile_ValidZipFile() {
        MockMultipartFile zipFile =
                new MockMultipartFile(
                        "file", "test.zip", "application/zip", "test content".getBytes());

        assertTrue(CbzUtils.isCbzFile(zipFile));
    }

    @Test
    void testIsCbzFile_InvalidFile() {
        MockMultipartFile textFile =
                new MockMultipartFile("file", "test.txt", "text/plain", "test content".getBytes());

        assertFalse(CbzUtils.isCbzFile(textFile));
    }

    @Test
    void testIsCbzFile_NoFilename() {
        MockMultipartFile noNameFile =
                new MockMultipartFile("file", null, "application/zip", "test content".getBytes());

        assertFalse(CbzUtils.isCbzFile(noNameFile));
    }

    @Test
    void testIsCbzFile_PdfFile() {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "file", "document.pdf", "application/pdf", "pdf content".getBytes());

        assertFalse(CbzUtils.isCbzFile(pdfFile));
    }

    @Test
    void testIsCbzFile_JpegFile() {
        MockMultipartFile jpegFile =
                new MockMultipartFile("file", "image.jpg", "image/jpeg", "jpeg content".getBytes());

        assertFalse(CbzUtils.isCbzFile(jpegFile));
    }

    @Test
    void testIsCbzFile_RarFile() {
        MockMultipartFile rarFile =
                new MockMultipartFile(
                        "file",
                        "archive.rar",
                        "application/x-rar-compressed",
                        "rar content".getBytes());

        assertFalse(CbzUtils.isCbzFile(rarFile));
    }

    @Test
    void testIsCbzFile_MixedCaseExtension() {
        MockMultipartFile cbzFile =
                new MockMultipartFile(
                        "file", "test.CBZ", "application/zip", "test content".getBytes());

        assertTrue(CbzUtils.isCbzFile(cbzFile));
    }
}
