package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.ExceptionUtils.PdfCorruptedException;

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

    @Test
    void acceptsATreeThatHoldsItsDeclaredCount() throws Exception {
        try (PDDocument document = withPages(3)) {
            assertThatCode(() -> CustomPDFDocumentFactory.rejectInflatedPageCount(document))
                    .doesNotThrowAnyException();
        }
    }

    @Test
    void acceptsADeclaredCountBelowTheRealOne() throws Exception {
        try (PDDocument document = withPages(3)) {
            root(document).setInt(COSName.COUNT, 2);

            assertThatCode(() -> CustomPDFDocumentFactory.rejectInflatedPageCount(document))
                    .doesNotThrowAnyException();
        }
    }

    @Test
    void refusesADeclaredCountAboveWhatTheTreeHolds() throws Exception {
        try (PDDocument document = withPages(1)) {
            root(document).setInt(COSName.COUNT, 1000);

            assertThatThrownBy(() -> CustomPDFDocumentFactory.rejectInflatedPageCount(document))
                    .isInstanceOf(PdfCorruptedException.class);
        }
    }

    @Test
    void refusesAnIntermediateNodeListedTwice() throws Exception {
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

            assertThatThrownBy(() -> CustomPDFDocumentFactory.rejectInflatedPageCount(document))
                    .isInstanceOf(PdfCorruptedException.class);
        }
    }

    @Test
    void acceptsALeafListedTwiceWhenTheCountAgrees() throws Exception {
        try (PDDocument document = withPages(1)) {
            COSDictionary root = root(document);
            COSArray kids = root.getCOSArray(COSName.KIDS);
            kids.add(kids.getObject(0));
            root.setInt(COSName.COUNT, 2);

            assertThatCode(() -> CustomPDFDocumentFactory.rejectInflatedPageCount(document))
                    .doesNotThrowAnyException();
        }
    }
}
