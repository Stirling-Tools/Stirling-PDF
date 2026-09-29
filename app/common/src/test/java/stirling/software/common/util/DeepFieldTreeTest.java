package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** A hostile or corrupt form must fail as a rejected request, never as a crashed thread. */
class DeepFieldTreeTest {

    private static byte[] chainOfKids(int depth) throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            document.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm form = new PDAcroForm(document);
            document.getDocumentCatalog().setAcroForm(form);

            COSDictionary root = new COSDictionary();
            root.setString(COSName.T, "n0");
            COSDictionary cursor = root;
            for (int i = 1; i < depth; i++) {
                COSDictionary kid = new COSDictionary();
                kid.setString(COSName.T, "n" + i);
                kid.setItem(COSName.PARENT, cursor);
                COSArray kids = new COSArray();
                kids.add(kid);
                cursor.setItem(COSName.KIDS, kids);
                cursor = kid;
            }
            cursor.setItem(COSName.FT, COSName.getPDFName("Tx"));

            COSArray fields = new COSArray();
            fields.add(root);
            form.getCOSObject().setItem(COSName.FIELDS, fields);
            document.save(out);
            return out.toByteArray();
        }
    }

    @Test
    @DisplayName("a deeply nested field tree extracts without overflowing the stack")
    void deepKidsChainDoesNotOverflow() throws IOException {
        // 2000 is as deep as PDFBox's own writer can build here; beyond that the overflow is in
        // the writer, not in extraction, so it is not something a read endpoint would hit.
        byte[] pdf = chainOfKids(2000);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            assertDoesNotThrow(() -> FormUtils.extractFormFieldsWithCoordinates(document));
        }
    }
}
