package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.PdfMetadata;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

@ExtendWith(MockitoExtension.class)
class SplitPdfByChaptersControllerTest {

    @Mock private PdfMetadataService pdfMetadataService;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private SplitPdfByChaptersController splitPdfByChaptersController;

    @Test
    void getSplitDocumentsBoas_includesMetadataWhenRequested() throws Exception {
        try (PDDocument sourceDocument = new PDDocument()) {
            sourceDocument.addPage(new PDPage());
            sourceDocument.addPage(new PDPage());

            List<Bookmark> bookmarks =
                    List.of(new Bookmark("Chapter 1", 0, 0), new Bookmark("Chapter 2", 1, 1));

            PdfMetadata metadata = new PdfMetadata();
            when(pdfMetadataService.extractMetadataFromPdf(sourceDocument)).thenReturn(metadata);

            List<ByteArrayOutputStream> result =
                    splitPdfByChaptersController.getSplitDocumentsBoas(
                            sourceDocument, bookmarks, true);

            assertEquals(2, result.size());
            assertTrue(result.stream().allMatch(stream -> stream.size() > 0));

            verify(pdfMetadataService, times(1)).extractMetadataFromPdf(sourceDocument);
            verify(pdfMetadataService, times(2))
                    .setMetadataToPdf(any(PDDocument.class), eq(metadata));
        }
    }

    @Test
    void getSplitDocumentsBoas_splitsEachBookmarkWithoutMetadata() throws Exception {
        try (PDDocument sourceDocument = new PDDocument()) {
            sourceDocument.addPage(new PDPage());
            sourceDocument.addPage(new PDPage());
            sourceDocument.addPage(new PDPage());

            List<Bookmark> bookmarks =
                    List.of(
                            new Bookmark("Chapter 1", 0, 0),
                            new Bookmark("Chapter 2", 1, 1),
                            new Bookmark("Chapter 3", 2, 2));

            List<ByteArrayOutputStream> result =
                    splitPdfByChaptersController.getSplitDocumentsBoas(
                            sourceDocument, bookmarks, false);

            assertEquals(3, result.size());

            for (ByteArrayOutputStream baos : result) {
                try (PDDocument split = Loader.loadPDF(baos.toByteArray())) {
                    assertEquals(1, split.getNumberOfPages());
                }
            }

            verify(pdfMetadataService, never()).extractMetadataFromPdf(any(PDDocument.class));
            verify(pdfMetadataService, never()).setMetadataToPdf(any(PDDocument.class), any());
        }
    }

    @Test
    void mergeBookmarksThatCorrespondToSamePage_mergesSequentialSinglePageBookmarks()
            throws Exception {
        List<Bookmark> bookmarks =
                new ArrayList<>(
                        List.of(
                                new Bookmark("Intro", 0, 0),
                                new Bookmark("Preface", 0, 0),
                                new Bookmark("Chapter 1", 0, 2),
                                new Bookmark("Appendix", 3, 3),
                                new Bookmark("Appendix B", 3, 3),
                                new Bookmark("Chapter 2", 4, 6)));

        Method mergeMethod =
                SplitPdfByChaptersController.class.getDeclaredMethod(
                        "mergeBookmarksThatCorrespondToSamePage", List.class);
        mergeMethod.setAccessible(true);

        @SuppressWarnings("unchecked")
        List<Bookmark> mergedBookmarks =
                (List<Bookmark>) mergeMethod.invoke(splitPdfByChaptersController, bookmarks);

        assertEquals(2, mergedBookmarks.size());
        assertEquals("Intro Preface ", mergedBookmarks.get(0).getTitle());
        assertEquals(0, mergedBookmarks.get(0).getStartPage());
        assertEquals(2, mergedBookmarks.get(0).getEndPage());
        assertEquals("Appendix Appendix B ", mergedBookmarks.get(1).getTitle());
        assertEquals(4, mergedBookmarks.get(1).getStartPage());
        assertEquals(6, mergedBookmarks.get(1).getEndPage());
    }

    // createZipFile Exception
    @Test
    void createZipFile_throwsExceptionWhenIOErrorOccurs() throws Exception {
        List<Bookmark> bookmarks =
                new ArrayList<>(List.of(new Bookmark("First", 0, 1), new Bookmark("Second", 2, 3)));
        Method createZipMethod =
                SplitPdfByChaptersController.class.getDeclaredMethod(
                        "createZipFile", List.class, List.class);
        createZipMethod.setAccessible(true);
        // Simulate an IOException by passing null documents
        assertThrows(
                Exception.class,
                () -> {
                    createZipMethod.invoke(
                            splitPdfByChaptersController, new ArrayList<>(bookmarks), null);
                });
    }

    @Test
    void createZipFile_includesAllSplitDocumentsWithFormattedNames() throws Exception {
        List<Bookmark> bookmarks =
                new ArrayList<>(List.of(new Bookmark("First", 0, 1), new Bookmark("Second", 2, 3)));

        ByteArrayOutputStream firstDocument = new ByteArrayOutputStream();
        firstDocument.write(new byte[] {1, 2, 3});
        ByteArrayOutputStream secondDocument = new ByteArrayOutputStream();
        secondDocument.write(new byte[] {4, 5, 6, 7});

        List<ByteArrayOutputStream> documents = List.of(firstDocument, secondDocument);

        Method createZipMethod =
                SplitPdfByChaptersController.class.getDeclaredMethod(
                        "createZipFile", List.class, List.class);
        createZipMethod.setAccessible(true);

        Path zipPath =
                (Path)
                        createZipMethod.invoke(
                                splitPdfByChaptersController,
                                new ArrayList<>(bookmarks),
                                documents);

        assertTrue(Files.exists(zipPath));

        try (ZipInputStream zipInputStream = new ZipInputStream(Files.newInputStream(zipPath))) {
            ZipEntry firstEntry = zipInputStream.getNextEntry();
            assertNotNull(firstEntry);
            assertEquals("0 First.pdf", firstEntry.getName());
            assertArrayEquals(firstDocument.toByteArray(), zipInputStream.readAllBytes());

            ZipEntry secondEntry = zipInputStream.getNextEntry();
            assertNotNull(secondEntry);
            assertEquals("1 Second.pdf", secondEntry.getName());
            assertArrayEquals(secondDocument.toByteArray(), zipInputStream.readAllBytes());

            assertNull(zipInputStream.getNextEntry());
        } finally {
            Files.deleteIfExists(zipPath);
        }
    }
}
