package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNull;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

class CustomPDFDocumentFactoryPageTreeTest {

    private static PDDocument withPages(int pages) {
        PDDocument document = new PDDocument();
        for (int i = 0; i < pages; i++) {
            document.addPage(new PDPage());
        }
        return document;
    }

    private static COSDictionary root(PDDocument document) {
        return document.getDocumentCatalog().getCOSObject().getCOSDictionary(COSName.PAGES);
    }

    private static int iteratedPages(PDDocument document) {
        int pages = 0;
        for (PDPage ignored : document.getPages()) {
            pages++;
        }
        return pages;
    }

    @Test
    void keepsACountTheTreeHolds() throws Exception {
        try (PDDocument document = withPages(3)) {
            CustomPDFDocumentFactory.correctInflatedPageCount(document);

            assertThat(document.getNumberOfPages()).isEqualTo(3);
        }
    }

    @Test
    void leavesADeclaredCountBelowTheRealOne() throws Exception {
        try (PDDocument document = withPages(3)) {
            root(document).setInt(COSName.COUNT, 2);

            CustomPDFDocumentFactory.correctInflatedPageCount(document);

            assertThat(document.getNumberOfPages()).isEqualTo(2);
        }
    }

    @Test
    void lowersACountAboveWhatTheTreeHolds() throws Exception {
        try (PDDocument document = withPages(1)) {
            root(document).setInt(COSName.COUNT, 1000);

            CustomPDFDocumentFactory.correctInflatedPageCount(document);

            assertThat(document.getNumberOfPages()).isEqualTo(1);
            assertThatCode(() -> document.getPage(0)).doesNotThrowAnyException();
        }
    }

    @Test
    void countsAnIntermediateNodeListedTwiceOnce() throws Exception {
        try (PDDocument document = withPages(1)) {
            COSDictionary root = root(document);
            COSDictionary page = (COSDictionary) root.getCOSArray(COSName.KIDS).getObject(0);
            COSDictionary node = new COSDictionary();
            node.setItem(COSName.TYPE, COSName.PAGES);
            COSArray nodeKids = new COSArray();
            nodeKids.add(page);
            node.setItem(COSName.KIDS, nodeKids);
            node.setInt(COSName.COUNT, 1);
            COSArray rootKids = new COSArray();
            rootKids.add(node);
            rootKids.add(node);
            root.setItem(COSName.KIDS, rootKids);
            root.setInt(COSName.COUNT, 2);

            CustomPDFDocumentFactory.correctInflatedPageCount(document);

            assertThat(document.getNumberOfPages()).isEqualTo(iteratedPages(document)).isOne();
        }
    }

    @Test
    void leavesANonPageLeafOutOfTheCount() throws Exception {
        try (PDDocument document = withPages(1)) {
            COSDictionary root = root(document);
            COSDictionary annotation = new COSDictionary();
            annotation.setItem(COSName.TYPE, COSName.ANNOT);
            root.getCOSArray(COSName.KIDS).add(annotation);
            root.setInt(COSName.COUNT, 2);

            CustomPDFDocumentFactory.correctInflatedPageCount(document);

            assertThat(document.getNumberOfPages()).isOne();
        }
    }

    @Test
    void countsAnUntypedLeafAsAPage() throws Exception {
        try (PDDocument document = withPages(1)) {
            COSDictionary root = root(document);
            COSDictionary untyped = new COSDictionary();
            untyped.setItem(COSName.MEDIA_BOX, new PDPage().getMediaBox().getCOSArray());
            root.getCOSArray(COSName.KIDS).add(untyped);
            root.setInt(COSName.COUNT, 2);

            CustomPDFDocumentFactory.correctInflatedPageCount(document);

            assertThat(document.getNumberOfPages()).isEqualTo(2);
            assertThatCode(() -> document.getPage(1)).doesNotThrowAnyException();
        }
    }

    @Test
    void countsANullEntryAsThePagePdfBoxPutsInItsPlace() throws Exception {
        try (PDDocument document = withPages(1)) {
            COSDictionary root = root(document);
            COSArray kids = root.getCOSArray(COSName.KIDS);
            COSDictionary realPage = (COSDictionary) kids.getObject(0);
            COSArray withNullFirst = new COSArray();
            withNullFirst.add(COSNull.NULL);
            withNullFirst.add(realPage);
            root.setItem(COSName.KIDS, withNullFirst);
            root.setInt(COSName.COUNT, 2);

            CustomPDFDocumentFactory.correctInflatedPageCount(document);

            assertThat(document.getNumberOfPages()).isEqualTo(2);
            assertThat(document.getPage(1).getCOSObject()).isSameAs(realPage);
        }
    }

    @Test
    void keepsALeafListedTwiceWhenTheCountAgrees() throws Exception {
        try (PDDocument document = withPages(1)) {
            COSDictionary root = root(document);
            COSArray kids = root.getCOSArray(COSName.KIDS);
            kids.add(kids.getObject(0));
            root.setInt(COSName.COUNT, 2);

            CustomPDFDocumentFactory.correctInflatedPageCount(document);

            assertThat(document.getNumberOfPages()).isEqualTo(2);
        }
    }

    @Test
    void loadingCorrectsTheCount() throws Exception {
        ByteArrayOutputStream saved = new ByteArrayOutputStream();
        try (PDDocument document = withPages(2)) {
            root(document).setInt(COSName.COUNT, 50_000);
            document.save(saved);
        }
        CustomPDFDocumentFactory factory =
                new CustomPDFDocumentFactory(mock(PdfMetadataService.class));

        try (PDDocument loaded = factory.load(saved.toByteArray(), true)) {
            assertThat(loaded.getNumberOfPages()).isEqualTo(2);
        }
    }
}
