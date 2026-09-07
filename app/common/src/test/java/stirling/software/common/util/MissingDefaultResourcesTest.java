package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** A form with no default resources is ordinary; adding a field to it must still work. */
class MissingDefaultResourcesTest {

    @Test
    @DisplayName("a text field can be added to a form that has no default resources")
    void addsToFormWithoutDefaultResources() throws IOException {
        // A real upload arrives as bytes, and plenty of forms in the wild carry no /DR at all.
        byte[] pdf;
        try (PDDocument built = new PDDocument();
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            built.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm form = new PDAcroForm(built);
            // A /DA naming a font with no /DR to resolve it is what PDFBox refuses.
            form.setDefaultAppearance("/Helv 0 Tf 0 g");
            form.getCOSObject().removeItem(org.apache.pdfbox.cos.COSName.DR);
            built.getDocumentCatalog().setAcroForm(form);
            built.save(out);
            pdf = out.toByteArray();
        }

        try (PDDocument document = org.apache.pdfbox.Loader.loadPDF(pdf)) {

            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.addNewFields(
                    document,
                    List.of(
                            new FormUtils.NewFormFieldDefinition(
                                    "note", null, "text", 0, 50f, 700f, 200f, 20f, null, null, null,
                                    null, null, null, null, null, null, null)),
                    skipped);

            assertTrue(
                    skipped.isEmpty(),
                    "adding a plain text field should not be refused: " + skipped);
            assertEquals(
                    1,
                    FormUtils.extractFormFields(document).size(),
                    "the field should be in the document");
        }
    }
}
