package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.*;

import org.apache.pdfbox.io.RandomAccessStreamCache;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.XMPBasicSchema;
import org.apache.xmpbox.xml.XmpSerializer;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.*;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class MergeControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private MergeController controller;
    @Mock private RandomAccessStreamCache.StreamCacheCreateFunction streamCacheCreateFunction;

    // --------------------- Reflection Helpers ---------------------
    // These call the private methods we want to test
    @SuppressWarnings("unchecked")
    private static Comparator<MultipartFile> invokeGetSortComparator(
            MergeController target, String sortType) throws Exception {
        Method m = MergeController.class.getDeclaredMethod("getSortComparator", String.class);
        m.setAccessible(true);
        return (Comparator<MultipartFile>) m.invoke(target, sortType);
    }

    private static MultipartFile[] invokeReorderedFiles(MultipartFile[] files, String order)
            throws Exception {
        Method m =
                MergeController.class.getDeclaredMethod(
                        "reorderFilesByProvidedOrder", MultipartFile[].class, String.class);
        m.setAccessible(true);
        return (MultipartFile[]) m.invoke(null, files, order);
    }

    private static int invokeIndexOfByOriginalFilename(List<MultipartFile> list, String name)
            throws Exception {
        Method m =
                MergeController.class.getDeclaredMethod(
                        "indexOfByOriginalFilename", List.class, String.class);
        m.setAccessible(true);
        return (int) m.invoke(null, list, name);
    }

    private static long invokeGetPdfDateTimeSafe(MergeController target, MultipartFile file)
            throws Exception {
        Method m =
                MergeController.class.getDeclaredMethod("getPdfDateTimeSafe", MultipartFile.class);
        m.setAccessible(true);
        try {
            return (long) m.invoke(target, file);
        } catch (InvocationTargetException ite) {
            if (ite.getCause() instanceof RuntimeException re) throw re;
            throw ite;
        }
    }

    private static PDDocument invokeMergeDocuments(MergeController target, List<PDDocument> docs)
            throws Exception {
        Method m = MergeController.class.getDeclaredMethod("mergeDocuments", List.class);
        m.setAccessible(true);
        return (PDDocument) m.invoke(target, docs);
    }

    private static void invokeAddTableOfContents(
            MergeController target, PDDocument doc, MultipartFile[] files) throws Exception {
        Method m =
                MergeController.class.getDeclaredMethod(
                        "addTableOfContents", PDDocument.class, MultipartFile[].class);
        m.setAccessible(true);
        m.invoke(target, doc, files);
    }

    // --------------------- Test Data Helpers ---------------------
    // Quick dummy file
    private static MockMultipartFile mmf(String name) {
        return new MockMultipartFile(
                "file", name, MediaType.APPLICATION_PDF_VALUE, new byte[] {1, 2, 3});
    }

    // Real PDF with a given number of pages
    private static MockMultipartFile mmfValidPdf(String name, int pages) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (PDDocument doc = createSimplePdf(pages)) {
            doc.save(baos);
        }
        return new MockMultipartFile(
                "file", name, MediaType.APPLICATION_PDF_VALUE, baos.toByteArray());
    }

    // Minimal valid PDF (blank pages)
    private static PDDocument createSimplePdf(int pages) throws IOException {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                /* empty content – just need a valid page */
            }
        }
        return doc;
    }

    // PDF with optional creation/modification dates and title
    private static PDDocument realDocWithInfo(Long mod, Long create, String title) {
        PDDocument doc = new PDDocument();
        PDDocumentInformation info = new PDDocumentInformation();
        if (mod != null) {
            Calendar c = Calendar.getInstance();
            c.setTimeInMillis(mod);
            info.setModificationDate(c);
        }
        if (create != null) {
            Calendar c = Calendar.getInstance();
            c.setTimeInMillis(create);
            info.setCreationDate(c);
        }
        if (title != null) info.setTitle(title);
        doc.setDocumentInformation(info);
        return doc;
    }

    // --------------------- Tests ---------------------

    @Nested
    @DisplayName("reorderFilesByProvidedOrder")
    class ReorderFilesTests {
        @Test
        void shouldHonorOrderAndKeepUnknowns() throws Exception {
            // given four files and an explicit order string
            MultipartFile a = mmf("A.pdf"), b = mmf("B.pdf"), c = mmf("C.pdf"), d = mmf("D.pdf");
            MultipartFile[] files = {a, b, c, d};
            String order = "  C.pdf \n\nA.pdf\r\nX.pdf  ";
            MultipartFile[] reordered = invokeReorderedFiles(files, order);
            // then the order should be respected, unknown files stay at the end
            assertEquals("C.pdf", reordered[0].getOriginalFilename());
            assertEquals("A.pdf", reordered[1].getOriginalFilename());
            assertEquals("B.pdf", reordered[2].getOriginalFilename());
            assertEquals("D.pdf", reordered[3].getOriginalFilename());
        }

        @Test
        void shouldReturnOriginalWhenBlank() throws Exception {
            // blank order string → no change
            MultipartFile a = mmf("A.pdf"), b = mmf("B.pdf");
            MultipartFile[] out = invokeReorderedFiles(new MultipartFile[] {a, b}, " \r\n  ");
            assertArrayEquals(new MultipartFile[] {a, b}, out);
        }
    }

    @Nested
    @DisplayName("indexOfByOriginalFilename")
    class IndexOfByOriginalFilenameTests {
        @Test
        void shouldReturnCorrectIndex() throws Exception {
            List<MultipartFile> list = List.of(mmf("foo.pdf"), mmf("bar.pdf"), mmf("baz.pdf"));
            assertEquals(1, invokeIndexOfByOriginalFilename(list, "bar.pdf"));
        }

        @Test
        void shouldReturnMinusOneWhenMissing() throws Exception {
            assertEquals(-1, invokeIndexOfByOriginalFilename(List.of(mmf("x.pdf")), "y.pdf"));
            assertEquals(-1, invokeIndexOfByOriginalFilename(List.of(), "any"));
        }
    }

    @Nested
    @DisplayName("getSortComparator – simple")
    class GetSortComparatorSimpleTests {
        @Test
        void byFileNameCaseInsensitive() throws Exception {
            // sort by filename, ignoring case and extension case
            MultipartFile b = mmf("b.pdf"), A = mmf("A.pdf"), c = mmf("c.PDF");
            Comparator<MultipartFile> comp = invokeGetSortComparator(controller, "byFileName");
            MultipartFile[] arr = {b, A, c};
            Arrays.sort(arr, comp);
            assertEquals("A.pdf", arr[0].getOriginalFilename());
            assertEquals("b.pdf", arr[1].getOriginalFilename());
            assertEquals("c.PDF", arr[2].getOriginalFilename());
        }

        @Test
        void orderProvidedPreservesOrder() throws Exception {
            // "orderProvided" means keep the order they arrived in
            MultipartFile f1 = mmf("1.pdf"), f2 = mmf("2.pdf"), f3 = mmf("3.pdf");
            Comparator<MultipartFile> comp = invokeGetSortComparator(controller, "orderProvided");
            MultipartFile[] arr = {f1, f2, f3};
            Arrays.sort(arr, comp);
            assertEquals("1.pdf", arr[0].getOriginalFilename());
            assertEquals("2.pdf", arr[1].getOriginalFilename());
            assertEquals("3.pdf", arr[2].getOriginalFilename());
        }

        @Test
        void defaultPreservesStableOrder() throws Exception {
            // unknown sort type → stable (no change)
            MultipartFile f1 = mmf("3.pdf"), f2 = mmf("1.pdf"), f3 = mmf("2.pdf");
            Comparator<MultipartFile> comp = invokeGetSortComparator(controller, "bogus");
            MultipartFile[] arr = {f1, f2, f3};
            Arrays.sort(arr, comp);
            assertEquals("3.pdf", arr[0].getOriginalFilename());
            assertEquals("1.pdf", arr[1].getOriginalFilename());
            assertEquals("2.pdf", arr[2].getOriginalFilename());
        }
    }

    @Nested
    @DisplayName("getSortComparator – date & title")
    class GetSortComparatorAdvancedTests {
        @Test
        void byDateModifiedDesc() throws Exception {
            // newest modification date first
            MultipartFile oldF = mmf("old.pdf"), newF = mmf("new.pdf");
            when(pdfDocumentFactory.load(oldF)).thenReturn(realDocWithInfo(1_000L, null, null));
            when(pdfDocumentFactory.load(newF)).thenReturn(realDocWithInfo(5_000L, null, null));
            Comparator<MultipartFile> comp = invokeGetSortComparator(controller, "byDateModified");
            MultipartFile[] arr = {oldF, newF};
            Arrays.sort(arr, comp);
            assertEquals("new.pdf", arr[0].getOriginalFilename());
            assertEquals("old.pdf", arr[1].getOriginalFilename());
        }

        @Test
        void byDateCreatedDesc() throws Exception {
            MultipartFile f1 = mmf("one.pdf"), f2 = mmf("two.pdf");
            when(pdfDocumentFactory.load(f1)).thenReturn(realDocWithInfo(null, 1_000L, null));
            when(pdfDocumentFactory.load(f2)).thenReturn(realDocWithInfo(null, 2_000L, null));
            Comparator<MultipartFile> comp = invokeGetSortComparator(controller, "byDateCreated");
            MultipartFile[] arr = {f1, f2};
            Arrays.sort(arr, comp);
            assertEquals("two.pdf", arr[0].getOriginalFilename());
            assertEquals("one.pdf", arr[1].getOriginalFilename());
        }

        @Test
        void byPDFTitleAscendingNullLast() throws Exception {
            MultipartFile a = mmf("alpha.pdf"), b = mmf("beta.pdf"), n = mmf("null.pdf");
            when(pdfDocumentFactory.load(a)).thenReturn(realDocWithInfo(null, null, "Alpha"));
            when(pdfDocumentFactory.load(b)).thenReturn(realDocWithInfo(null, null, "beta"));
            when(pdfDocumentFactory.load(n)).thenReturn(realDocWithInfo(null, null, null));
            Comparator<MultipartFile> comp = invokeGetSortComparator(controller, "byPDFTitle");
            MultipartFile[] arr = {b, n, a};
            Arrays.sort(arr, comp);
            assertEquals("alpha.pdf", arr[0].getOriginalFilename());
            assertEquals("beta.pdf", arr[1].getOriginalFilename());
            assertEquals("null.pdf", arr[2].getOriginalFilename());
        }

        @Test
        void byPDFTitleIOExceptionTreatedEqual() throws Exception {
            // if reading the title throws, treat files as equal
            MultipartFile t = mmf("throw.pdf"), ok = mmf("ok.pdf");
            when(pdfDocumentFactory.load(t)).thenThrow(new IOException("boom"));
            lenient()
                    .when(pdfDocumentFactory.load(ok))
                    .thenReturn(realDocWithInfo(null, null, "Title"));

            Comparator<MultipartFile> comp = invokeGetSortComparator(controller, "byPDFTitle");
            assertEquals(0, comp.compare(t, ok));
        }

        @Test
        void byPDFTitleNullsTreatedEqual() throws Exception {
            // both titles null → equal
            MultipartFile n1 = mmf("n1.pdf"), n2 = mmf("n2.pdf");
            when(pdfDocumentFactory.load(n1)).thenReturn(realDocWithInfo(null, null, null));
            when(pdfDocumentFactory.load(n2)).thenReturn(realDocWithInfo(null, null, null));

            Comparator<MultipartFile> comp = invokeGetSortComparator(controller, "byPDFTitle");
            assertEquals(0, comp.compare(n1, n2));
        }
    }

    @Nested
    @DisplayName("getPdfDateTimeSafe")
    class GetPdfDateTimeSafeTests {
        @Test
        void prefersInfoModDate() throws Exception {
            MultipartFile f = mmf("mod.pdf");
            when(pdfDocumentFactory.load(f)).thenReturn(realDocWithInfo(9_000L, 1_000L, null));
            assertEquals(9_000L, invokeGetPdfDateTimeSafe(controller, f));
        }

        @Test
        void fallsBackToCreationDate() throws Exception {
            MultipartFile f = mmf("create.pdf");
            when(pdfDocumentFactory.load(f)).thenReturn(realDocWithInfo(null, 2_000L, null));
            assertEquals(2_000L, invokeGetPdfDateTimeSafe(controller, f));
        }

        @Test
        void usesXmpModifyDateWhenInfoEmpty() throws Exception {
            MultipartFile f = mmf("xmp.pdf");
            PDDocument doc = new PDDocument();
            doc.setDocumentInformation(new PDDocumentInformation());

            XMPMetadata xmp = XMPMetadata.createXMPMetadata();
            XMPBasicSchema bs = xmp.createAndAddXMPBasicSchema();
            Calendar cal = Calendar.getInstance();
            cal.setTimeInMillis(8_000L);
            bs.setModifyDate(cal);
            XmpSerializer ser = new XmpSerializer();
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ser.serialize(xmp, baos, true);

            PDMetadata meta = new PDMetadata(doc);
            meta.importXMPMetadata(baos.toByteArray());
            doc.getDocumentCatalog().setMetadata(meta);

            when(pdfDocumentFactory.load(f)).thenReturn(doc);
            assertEquals(8_000L, invokeGetPdfDateTimeSafe(controller, f));
        }

        @Test
        void returnsZeroOnIOException() throws Exception {
            MultipartFile f = mmf("bad.pdf");
            when(pdfDocumentFactory.load(f)).thenThrow(new IOException("boom"));
            assertEquals(0L, invokeGetPdfDateTimeSafe(controller, f));
        }

        // basic.getCreateDate() != null
        @Test
        void usesXmpCreateDateWhenInfoEmpty() throws Exception {
            MultipartFile f = mmf("xmpcreate.pdf");
            PDDocument doc = new PDDocument();
            doc.setDocumentInformation(new PDDocumentInformation());
            XMPMetadata xmp = XMPMetadata.createXMPMetadata();
            XMPBasicSchema bs = xmp.createAndAddXMPBasicSchema();
            Calendar cal = Calendar.getInstance();
            cal.setTimeInMillis(7_000L);
            bs.setCreateDate(cal);
            XmpSerializer ser = new XmpSerializer();
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ser.serialize(xmp, baos, true);
            PDMetadata meta = new PDMetadata(doc);
            meta.importXMPMetadata(baos.toByteArray());
            doc.getDocumentCatalog().setMetadata(meta);

            when(pdfDocumentFactory.load(f)).thenReturn(doc);
            assertEquals(7_000L, invokeGetPdfDateTimeSafe(controller, f));
        }
    }

    @Nested
    @DisplayName("mergeDocuments")
    class MergeDocumentsTests {
        @Test
        void mergesMultipleDocs() throws Exception {
            // empty document as base
            when(pdfDocumentFactory.createNewDocument()).thenReturn(createSimplePdf(0));
            PDDocument d1 = createSimplePdf(1), d2 = createSimplePdf(2);
            PDDocument merged = invokeMergeDocuments(controller, List.of(d1, d2));
            assertEquals(3, merged.getNumberOfPages());
            merged.close();
            d1.close();
            d2.close();
        }
    }

    @Nested
    @DisplayName("addTableOfContents")
    class AddTableOfContentsTests {
        @Test
        void addsOutlineItems() throws Exception {
            PDDocument merged = createSimplePdf(3);
            MultipartFile f1 = mmf("doc1.pdf"), f2 = mmf("doc2.pdf");
            when(pdfDocumentFactory.load(f1)).thenReturn(createSimplePdf(1));
            when(pdfDocumentFactory.load(f2)).thenReturn(createSimplePdf(2));
            invokeAddTableOfContents(controller, merged, new MultipartFile[] {f1, f2});

            PDDocumentOutline outline = merged.getDocumentCatalog().getDocumentOutline();
            assertNotNull(outline);
            PDOutlineItem first = outline.getFirstChild();
            assertEquals("doc1", first.getTitle());
            assertEquals("doc2", first.getNextSibling().getTitle());
            merged.close();
        }

        @Test
        void addTableOfContentsIOExceptionHandled() throws Exception {
            PDDocument merged = createSimplePdf(1);
            MultipartFile badFile = mmf("bad.pdf");
            when(pdfDocumentFactory.load(badFile)).thenThrow(new IOException("boom"));
            // should not throw
            invokeAddTableOfContents(controller, merged, new MultipartFile[] {badFile});
            merged.close();
        }
    }
}
