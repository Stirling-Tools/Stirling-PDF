package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;

/**
 * Gap tests for {@link MergeController} private helper logic reachable via reflection. Focuses on
 * sort comparators, file-order reordering, client file-id parsing, date extraction and filename
 * lookup. The external JPDFium merge path is not exercised here (covered structurally elsewhere).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MergeControllerGapTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private MergeController mergeController;

    private MockMultipartFile fileA;
    private MockMultipartFile fileB;
    private MockMultipartFile fileC;

    @BeforeEach
    void setUp() {
        fileA =
                new MockMultipartFile(
                        "fileInput", "Apple.pdf", MediaType.APPLICATION_PDF_VALUE, "a".getBytes());
        fileB =
                new MockMultipartFile(
                        "fileInput", "banana.pdf", MediaType.APPLICATION_PDF_VALUE, "b".getBytes());
        fileC =
                new MockMultipartFile(
                        "fileInput", "Cherry.pdf", MediaType.APPLICATION_PDF_VALUE, "c".getBytes());
    }

    // ---- reflection helpers -------------------------------------------------

    @SuppressWarnings("unchecked")
    private java.util.Comparator<MultipartFile> sortComparator(String sortType) throws Exception {
        Method m = MergeController.class.getDeclaredMethod("getSortComparator", String.class);
        m.setAccessible(true);
        return (java.util.Comparator<MultipartFile>) m.invoke(mergeController, sortType);
    }

    private MultipartFile[] reorder(MultipartFile[] files, String fileOrder) throws Exception {
        Method m =
                MergeController.class.getDeclaredMethod(
                        "reorderFilesByProvidedOrder", MultipartFile[].class, String.class);
        m.setAccessible(true);
        return (MultipartFile[]) m.invoke(null, files, fileOrder);
    }

    private String[] parseClientFileIds(String value) throws Exception {
        Method m = MergeController.class.getDeclaredMethod("parseClientFileIds", String.class);
        m.setAccessible(true);
        return (String[]) m.invoke(mergeController, value);
    }

    private long getPdfDateTimeSafe(MultipartFile file) throws Exception {
        Method m =
                MergeController.class.getDeclaredMethod("getPdfDateTimeSafe", MultipartFile.class);
        m.setAccessible(true);
        return (long) m.invoke(mergeController, file);
    }

    @SuppressWarnings("unchecked")
    private int indexOfByOriginalFilename(List<MultipartFile> list, String name) throws Exception {
        Method m =
                MergeController.class.getDeclaredMethod(
                        "indexOfByOriginalFilename", List.class, String.class);
        m.setAccessible(true);
        return (int) m.invoke(null, list, name);
    }

    private static PDDocument docWithTitle(String title) {
        PDDocument doc = mock(PDDocument.class);
        PDDocumentInformation info = mock(PDDocumentInformation.class);
        when(doc.getDocumentInformation()).thenReturn(info);
        when(info.getTitle()).thenReturn(title);
        return doc;
    }

    // ---- getSortComparator: byFileName --------------------------------------

    @Nested
    @DisplayName("getSortComparator: byFileName")
    class ByFileName {

        @Test
        @DisplayName("sorts case-insensitively by original filename")
        void sortsCaseInsensitively() throws Exception {
            MultipartFile[] files = {fileC, fileA, fileB};
            Arrays.sort(files, sortComparator("byFileName"));
            assertArrayEquals(new MultipartFile[] {fileA, fileB, fileC}, files);
        }

        @Test
        @DisplayName("null original filename is treated as empty and sorts first")
        void nullFilenameSortsFirst() throws Exception {
            MultipartFile nullName = mock(MultipartFile.class);
            when(nullName.getOriginalFilename()).thenReturn(null);
            MultipartFile[] files = {fileB, nullName, fileA};
            Arrays.sort(files, sortComparator("byFileName"));
            assertSame(nullName, files[0]);
            assertSame(fileA, files[1]);
            assertSame(fileB, files[2]);
        }
    }

    // ---- getSortComparator: byPDFTitle --------------------------------------

    @Nested
    @DisplayName("getSortComparator: byPDFTitle")
    class ByPdfTitle {

        @Test
        @DisplayName("orders documents by their PDF title, ignoring case")
        void ordersByTitle() throws Exception {
            PDDocument docZ = docWithTitle("Zebra");
            PDDocument docA = docWithTitle("alpha");
            when(pdfDocumentFactory.load(fileA)).thenReturn(docZ);
            when(pdfDocumentFactory.load(fileB)).thenReturn(docA);

            int cmp = sortComparator("byPDFTitle").compare(fileA, fileB);
            assertTrue(cmp > 0, "Zebra should sort after alpha");
            // and the documents are closed via try-with-resources
            verify(docZ).close();
            verify(docA).close();
        }

        @Test
        @DisplayName("both titles null yields equal (0)")
        void bothNullTitlesEqual() throws Exception {
            PDDocument d1 = docWithTitle(null);
            PDDocument d2 = docWithTitle(null);
            when(pdfDocumentFactory.load(fileA)).thenReturn(d1);
            when(pdfDocumentFactory.load(fileB)).thenReturn(d2);

            assertEquals(0, sortComparator("byPDFTitle").compare(fileA, fileB));
        }

        @Test
        @DisplayName("first title null sorts after non-null (returns 1)")
        void firstNullSortsLast() throws Exception {
            PDDocument d1 = docWithTitle(null);
            PDDocument d2 = docWithTitle("Beta");
            when(pdfDocumentFactory.load(fileA)).thenReturn(d1);
            when(pdfDocumentFactory.load(fileB)).thenReturn(d2);

            assertEquals(1, sortComparator("byPDFTitle").compare(fileA, fileB));
        }

        @Test
        @DisplayName("second title null sorts first (returns -1)")
        void secondNullSortsFirst() throws Exception {
            PDDocument d1 = docWithTitle("Alpha");
            PDDocument d2 = docWithTitle(null);
            when(pdfDocumentFactory.load(fileA)).thenReturn(d1);
            when(pdfDocumentFactory.load(fileB)).thenReturn(d2);

            assertEquals(-1, sortComparator("byPDFTitle").compare(fileA, fileB));
        }

        @Test
        @DisplayName("IOException while loading yields equal (0)")
        void ioExceptionYieldsEqual() throws Exception {
            when(pdfDocumentFactory.load(fileA)).thenThrow(new IOException("boom"));
            assertEquals(0, sortComparator("byPDFTitle").compare(fileA, fileB));
        }
    }

    // ---- getSortComparator: date-based and no-op orders ---------------------

    @Nested
    @DisplayName("getSortComparator: date-based and pass-through orders")
    class DateAndPassThrough {

        private PDDocument docWithModDate(long millis) {
            PDDocument doc = mock(PDDocument.class);
            PDDocumentInformation info = mock(PDDocumentInformation.class);
            Calendar cal = new GregorianCalendar();
            cal.setTimeInMillis(millis);
            when(doc.getDocumentInformation()).thenReturn(info);
            when(info.getModificationDate()).thenReturn(cal);
            return doc;
        }

        @Test
        @DisplayName("byDateModified orders newest first (descending)")
        void byDateModifiedNewestFirst() throws Exception {
            PDDocument older = docWithModDate(1_000L);
            PDDocument newer = docWithModDate(9_000L);
            when(pdfDocumentFactory.load(fileA)).thenReturn(older);
            when(pdfDocumentFactory.load(fileB)).thenReturn(newer);

            // file1=older, file2=newer -> Long.compare(t2=newer, t1=older) > 0 -> older after newer
            int cmp = sortComparator("byDateModified").compare(fileA, fileB);
            assertTrue(cmp > 0);
        }

        @Test
        @DisplayName("byDateCreated uses the same descending logic")
        void byDateCreatedNewestFirst() throws Exception {
            PDDocument older = docWithModDate(2_000L);
            PDDocument newer = docWithModDate(8_000L);
            when(pdfDocumentFactory.load(fileA)).thenReturn(newer);
            when(pdfDocumentFactory.load(fileB)).thenReturn(older);

            int cmp = sortComparator("byDateCreated").compare(fileA, fileB);
            assertTrue(cmp < 0, "newer (file1) should sort before older (file2)");
        }

        @Test
        @DisplayName("orderProvided is a stable no-op comparator (0)")
        void orderProvidedNoOp() throws Exception {
            assertEquals(0, sortComparator("orderProvided").compare(fileA, fileB));
        }

        @Test
        @DisplayName("unknown sort type falls back to no-op comparator (0)")
        void unknownSortTypeNoOp() throws Exception {
            assertEquals(0, sortComparator("somethingElse").compare(fileA, fileB));
        }
    }

    // ---- getPdfDateTimeSafe -------------------------------------------------

    @Nested
    @DisplayName("getPdfDateTimeSafe")
    class GetPdfDateTimeSafe {

        @Test
        @DisplayName("returns modification date millis when present")
        void returnsModificationDate() throws Exception {
            PDDocument doc = mock(PDDocument.class);
            PDDocumentInformation info = mock(PDDocumentInformation.class);
            Calendar cal = new GregorianCalendar();
            cal.setTimeInMillis(123_456L);
            when(doc.getDocumentInformation()).thenReturn(info);
            when(info.getModificationDate()).thenReturn(cal);
            when(pdfDocumentFactory.load(fileA)).thenReturn(doc);

            assertEquals(123_456L, getPdfDateTimeSafe(fileA));
            verify(doc).close();
        }

        @Test
        @DisplayName("falls back to creation date when modification date is null")
        void fallsBackToCreationDate() throws Exception {
            PDDocument doc = mock(PDDocument.class);
            PDDocumentInformation info = mock(PDDocumentInformation.class);
            Calendar cal = new GregorianCalendar();
            cal.setTimeInMillis(777L);
            when(doc.getDocumentInformation()).thenReturn(info);
            when(info.getModificationDate()).thenReturn(null);
            when(info.getCreationDate()).thenReturn(cal);
            when(pdfDocumentFactory.load(fileA)).thenReturn(doc);

            assertEquals(777L, getPdfDateTimeSafe(fileA));
        }

        @Test
        @DisplayName("returns 0 when no info dates and no XMP metadata present")
        void returnsZeroWhenNoDates() throws Exception {
            PDDocument doc = mock(PDDocument.class);
            PDDocumentInformation info = mock(PDDocumentInformation.class);
            PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
            when(doc.getDocumentInformation()).thenReturn(info);
            when(info.getModificationDate()).thenReturn(null);
            when(info.getCreationDate()).thenReturn(null);
            when(doc.getDocumentCatalog()).thenReturn(catalog);
            when(catalog.getMetadata()).thenReturn(null);
            when(pdfDocumentFactory.load(fileA)).thenReturn(doc);

            assertEquals(0L, getPdfDateTimeSafe(fileA));
            verify(doc).close();
        }

        @Test
        @DisplayName("returns 0 when document info itself is null")
        void returnsZeroWhenInfoNull() throws Exception {
            PDDocument doc = mock(PDDocument.class);
            PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
            when(doc.getDocumentInformation()).thenReturn(null);
            when(doc.getDocumentCatalog()).thenReturn(catalog);
            when(catalog.getMetadata()).thenReturn(null);
            when(pdfDocumentFactory.load(fileA)).thenReturn(doc);

            assertEquals(0L, getPdfDateTimeSafe(fileA));
        }

        @Test
        @DisplayName("returns 0 and swallows IOException on load failure")
        void returnsZeroOnLoadFailure() throws Exception {
            when(pdfDocumentFactory.load(fileA)).thenThrow(new IOException("cannot open"));
            assertEquals(0L, getPdfDateTimeSafe(fileA));
        }
    }

    // ---- parseClientFileIds -------------------------------------------------

    @Nested
    @DisplayName("parseClientFileIds")
    class ParseClientFileIds {

        @Test
        @DisplayName("null input returns empty array")
        void nullReturnsEmpty() throws Exception {
            assertEquals(0, parseClientFileIds(null).length);
        }

        @Test
        @DisplayName("blank input returns empty array")
        void blankReturnsEmpty() throws Exception {
            assertEquals(0, parseClientFileIds("   ").length);
        }

        @Test
        @DisplayName("empty JSON array returns empty array")
        void emptyArrayReturnsEmpty() throws Exception {
            assertEquals(0, parseClientFileIds("[]").length);
            assertEquals(0, parseClientFileIds("[   ]").length);
        }

        @Test
        @DisplayName("non-array text returns empty array")
        void nonArrayReturnsEmpty() throws Exception {
            assertEquals(0, parseClientFileIds("not-an-array").length);
        }

        @Test
        @DisplayName("parses quoted, comma-separated ids and strips surrounding quotes")
        void parsesQuotedIds() throws Exception {
            String[] result = parseClientFileIds("[\"id1\", \"id2\",\"id3\"]");
            assertArrayEquals(new String[] {"id1", "id2", "id3"}, result);
        }

        @Test
        @DisplayName("parses unquoted ids as-is after trimming")
        void parsesUnquotedIds() throws Exception {
            String[] result = parseClientFileIds("[a, b , c]");
            assertArrayEquals(new String[] {"a", "b", "c"}, result);
        }

        @Test
        @DisplayName("single element array yields a one-element result")
        void singleElement() throws Exception {
            assertArrayEquals(new String[] {"only"}, parseClientFileIds("[\"only\"]"));
        }
    }

    // ---- reorderFilesByProvidedOrder ----------------------------------------

    @Nested
    @DisplayName("reorderFilesByProvidedOrder")
    class ReorderFilesByProvidedOrder {

        @Test
        @DisplayName("reorders files to match the newline-separated order list")
        void reordersToMatchOrder() throws Exception {
            MultipartFile[] files = {fileA, fileB, fileC};
            MultipartFile[] result = reorder(files, "Cherry.pdf\nApple.pdf\nbanana.pdf");
            assertArrayEquals(new MultipartFile[] {fileC, fileA, fileB}, result);
        }

        @Test
        @DisplayName("handles CRLF separators")
        void handlesCrlf() throws Exception {
            MultipartFile[] files = {fileA, fileB};
            MultipartFile[] result = reorder(files, "banana.pdf\r\nApple.pdf");
            assertArrayEquals(new MultipartFile[] {fileB, fileA}, result);
        }

        @Test
        @DisplayName("unmatched names are skipped and remaining files appended in original order")
        void unmatchedNamesAppendedAtEnd() throws Exception {
            MultipartFile[] files = {fileA, fileB, fileC};
            // only mention Cherry; ghost.pdf is ignored; Apple+banana keep original relative order
            MultipartFile[] result = reorder(files, "Cherry.pdf\nghost.pdf");
            assertArrayEquals(new MultipartFile[] {fileC, fileA, fileB}, result);
        }

        @Test
        @DisplayName("blank/empty order entries are skipped")
        void blankEntriesSkipped() throws Exception {
            MultipartFile[] files = {fileA, fileB};
            MultipartFile[] result = reorder(files, "\n  \nbanana.pdf\n");
            assertArrayEquals(new MultipartFile[] {fileB, fileA}, result);
        }

        @Test
        @DisplayName("empty file array returns empty array")
        void emptyFilesReturnsEmpty() throws Exception {
            MultipartFile[] result = reorder(new MultipartFile[0], "anything.pdf");
            assertEquals(0, result.length);
        }
    }

    // ---- indexOfByOriginalFilename ------------------------------------------

    @Nested
    @DisplayName("indexOfByOriginalFilename")
    class IndexOfByOriginalFilename {

        @Test
        @DisplayName("returns index of matching filename")
        void returnsMatchIndex() throws Exception {
            List<MultipartFile> list = new ArrayList<>(Arrays.asList(fileA, fileB, fileC));
            assertEquals(1, indexOfByOriginalFilename(list, "banana.pdf"));
        }

        @Test
        @DisplayName("returns first match index when duplicates exist")
        void returnsFirstMatch() throws Exception {
            MockMultipartFile dup =
                    new MockMultipartFile(
                            "fileInput",
                            "Apple.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            "dup".getBytes());
            List<MultipartFile> list = new ArrayList<>(Arrays.asList(fileA, dup));
            assertEquals(0, indexOfByOriginalFilename(list, "Apple.pdf"));
        }

        @Test
        @DisplayName("returns -1 when not found")
        void returnsMinusOneWhenAbsent() throws Exception {
            List<MultipartFile> list = new ArrayList<>(Arrays.asList(fileA, fileB));
            assertEquals(-1, indexOfByOriginalFilename(list, "missing.pdf"));
        }

        @Test
        @DisplayName("returns -1 for empty list")
        void returnsMinusOneForEmpty() throws Exception {
            assertEquals(-1, indexOfByOriginalFilename(new ArrayList<>(), "x.pdf"));
        }
    }

    // ---- mergeDocuments null-collaborator wiring ----------------------------

    @Nested
    @DisplayName("mergeDocuments wiring")
    class MergeDocumentsWiring {

        @Test
        @DisplayName("creates a fresh document from the factory and returns it")
        void createsFromFactory() throws Exception {
            PDDocument merged = mock(PDDocument.class);
            when(pdfDocumentFactory.createNewDocument()).thenReturn(merged);

            PDDocument result = mergeController.mergeDocuments(List.of());

            assertNotNull(result);
            assertSame(merged, result);
            verify(pdfDocumentFactory).createNewDocument();
            verify(merged, never()).close();
        }
    }
}
