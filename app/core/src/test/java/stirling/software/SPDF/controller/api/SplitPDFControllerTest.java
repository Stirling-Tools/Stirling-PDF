package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class SplitPDFControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @Mock private TempFileManager tempFileManager;

    @InjectMocks private SplitPDFController controller;

    @Test
    @DisplayName("Splits a PDF into multiple files and returns them as a ZIP archive")
    void splitPdfReturnsZipWithSplitDocuments() throws Exception {
        PDDocument sourceDocument = new PDDocument();
        sourceDocument.addPage(new PDPage());
        sourceDocument.addPage(new PDPage());
        sourceDocument.addPage(new PDPage());

        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput",
                        "sample.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        new byte[] {1, 2, 3});

        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(file);
        request.setPageNumbers("1,2");

        Path tempZipPath = Files.createTempFile("split-pdf-controller-test", ".zip");

        Mockito.when(pdfDocumentFactory.load(file)).thenReturn(sourceDocument);
        Mockito.when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument))
                .thenAnswer(invocation -> new PDDocument());
        Mockito.when(tempFileManager.createTempFile(".zip")).thenReturn(tempZipPath.toFile());
        Mockito.doAnswer(
                        invocation -> {
                            Files.deleteIfExists(tempZipPath);
                            return true;
                        })
                .when(tempFileManager)
                .deleteTempFile(tempZipPath.toFile());

        ResponseEntity<byte[]> response = controller.splitPdf(request);

        assertEquals(MediaType.APPLICATION_OCTET_STREAM, response.getHeaders().getContentType());
        assertEquals(
                "sample_split.zip", response.getHeaders().getContentDisposition().getFilename());

        byte[] body = response.getBody();
        assertNotNull(body);
        assertTrue(body.length > 0, "Expected ZIP response to contain data");

        List<String> entryNames = new ArrayList<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(body))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryNames.add(entry.getName());

                ByteArrayOutputStream entryBytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[1024];
                int len;
                while ((len = zis.read(buffer)) != -1) {
                    entryBytes.write(buffer, 0, len);
                }

                try (PDDocument splitDoc = Loader.loadPDF(entryBytes.toByteArray())) {
                    assertEquals(1, splitDoc.getNumberOfPages());
                }
                zis.closeEntry();
            }
        }

        assertArrayEquals(
                new String[] {"sample_1.pdf", "sample_2.pdf", "sample_3.pdf"},
                entryNames.toArray(new String[0]));

        verify(pdfDocumentFactory).load(file);
        verify(pdfDocumentFactory, times(3)).createNewDocumentBasedOnOldDocument(sourceDocument);
    }
}
